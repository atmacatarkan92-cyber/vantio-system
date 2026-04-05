"""
Smart Product Import — Phase 2: safe URL fetch, text normalization, LLM extraction, fallbacks.

Response shape matches Phase 1 (draft, field_hints, warnings, meta) for frontend compatibility.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import re
import socket
import time
from typing import Any, Dict, List, Literal, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)


def _normalize_product_url(v: object) -> Optional[str]:
    """Same rules as inventory create — http(s) with host (shared with routes)."""
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    p = urlparse(s)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise ValueError("product_url must be a valid http(s) URL with a host")
    return s

# --- Limits (safe URL fetch) ---
FETCH_TIMEOUT_SEC = 10.0
MAX_RESPONSE_BYTES = 1_500_000  # ~1.5 MB
MAX_REDIRECTS = 3
MAX_LLM_INPUT_CHARS = 48_000
MAX_EXCERPT_META = 500

# Blocked hostnames (SSRF)
_FORBIDDEN_HOSTNAMES = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "metadata.google.internal",
    }
)

# Cloud metadata endpoint (explicit)
_METADATA_IPS = frozenset({"169.254.169.254"})


def _is_forbidden_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    if ip_str in _METADATA_IPS:
        return True
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _hostname_from_url(url: str) -> str:
    p = urlparse(url)
    h = (p.hostname or "").strip().lower()
    return h


def _assert_url_safe_for_fetch(url: str) -> None:
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise ValueError("Nur http(s)-URLs erlaubt.")
    if not p.netloc:
        raise ValueError("Ungültige URL.")
    host = _hostname_from_url(url)
    if not host:
        raise ValueError("Ungültiger Host.")
    if host in _FORBIDDEN_HOSTNAMES:
        raise ValueError("Host nicht erlaubt.")
    # Resolve and block private / link-local targets (SSRF)
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError as e:
        raise ValueError("Host konnte nicht aufgelöst werden.") from e
    seen: set[str] = set()
    for info in infos:
        ip = info[4][0]
        if ip in seen:
            continue
        seen.add(ip)
        if _is_forbidden_ip(ip):
            raise ValueError("Zieladresse nicht erlaubt (internes Netzwerk).")


def _strip_html_to_text(html: str) -> Tuple[str, Optional[str]]:
    """Remove scripts/styles/tags; return (text, title)."""
    title_m = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    title = title_m.group(1).strip() if title_m else None
    if title:
        title = re.sub(r"\s+", " ", title).strip()
    body = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    body = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", body)
    body = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", body)
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"[\xa0\r\n\t]+", " ", body)
    text = re.sub(r" +", " ", body).strip()
    return text, title


def _read_body_capped(response: httpx.Response, max_bytes: int) -> bytes:
    out = bytearray()
    for chunk in response.iter_bytes():
        out.extend(chunk)
        if len(out) >= max_bytes:
            break
    return bytes(out)


def fetch_url_safe(url: str, request_id: str = "") -> Tuple[Optional[str], Optional[str], List[Dict[str, Any]]]:
    """
    Fetch URL with SSRF checks, redirect cap, size cap, html-only.
    Returns (plain_text, page_title, warnings). On failure text/title may be None.
    """
    warnings: List[Dict[str, Any]] = []
    try:
        _assert_url_safe_for_fetch(url)
    except ValueError as e:
        warnings.append(
            {
                "code": "url_blocked",
                "message": str(e),
                "severity": "warning",
            }
        )
        return None, None, warnings

    current = url
    with httpx.Client(timeout=FETCH_TIMEOUT_SEC, follow_redirects=False, verify=True) as client:
        try:
            for redirect_i in range(MAX_REDIRECTS + 1):
                _assert_url_safe_for_fetch(current)
                r = client.get(current)
                if r.status_code in (301, 302, 303, 307, 308):
                    loc = r.headers.get("location")
                    if not loc or redirect_i >= MAX_REDIRECTS:
                        warnings.append(
                            {
                                "code": "fetch_redirect",
                                "message": "Weiterleitung abgebrochen oder ungültig.",
                                "severity": "warning",
                            }
                        )
                        return None, None, warnings
                    current = urljoin(current, loc)
                    continue

                if r.status_code != 200:
                    warnings.append(
                        {
                            "code": "fetch_http",
                            "message": f"Seite konnte nicht geladen werden (HTTP {r.status_code}).",
                            "severity": "warning",
                        }
                    )
                    return None, None, warnings

                ct = (r.headers.get("content-type") or "").lower().split(";")[0].strip()
                if ct not in ("text/html", "application/xhtml+xml") and "html" not in ct:
                    warnings.append(
                        {
                            "code": "fetch_content_type",
                            "message": "Antwort ist kein HTML — Text konnte nicht extrahiert werden.",
                            "severity": "warning",
                        }
                    )
                    return None, None, warnings

                raw = _read_body_capped(r, MAX_RESPONSE_BYTES)
                try:
                    html = raw.decode(r.encoding or "utf-8", errors="replace")
                except Exception:
                    html = raw.decode("utf-8", errors="replace")
                text, page_title = _strip_html_to_text(html)
                if page_title and text and page_title.lower() not in text[:200].lower():
                    combined = f"{page_title}. {text}"
                else:
                    combined = text or page_title or ""
                return combined.strip() or None, page_title, warnings
        except httpx.TimeoutException:
            warnings.append(
                {
                    "code": "fetch_timeout",
                    "message": "Zeitüberschreitung beim Laden der URL.",
                    "severity": "warning",
                }
            )
            return None, None, warnings
        except httpx.RequestError as e:
            logger.info(
                "inventory_import_fetch_error request_id=%s type=%s",
                request_id or "—",
                type(e).__name__,
            )
            warnings.append(
                {
                    "code": "fetch_error",
                    "message": "URL konnte nicht geladen werden.",
                    "severity": "warning",
                }
            )
            return None, None, warnings


def normalize_text_for_llm(raw: str) -> str:
    if not raw:
        return ""
    s = raw.replace("\x00", " ")
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", s)
    s = re.sub(r"\r\n?", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n[ \t]+", "\n", s)
    s = s.strip()
    if len(s) > MAX_LLM_INPUT_CHARS:
        s = s[:MAX_LLM_INPUT_CHARS] + "\n…"
    return s


# --- Price parsing (CHF-focused; conservative; EUR → note only) ---

_APOST = r"['\u2019\u2018\uff07`]"  # ', ', etc.


def _parse_price_token_to_float(token: str) -> Optional[float]:
    """
    Parse a single numeric token (currency prefix/suffix already stripped).
    Supports: apostrophe thousands, dot thousands + comma decimals, trailing .- / .–
    Returns None if ambiguous or invalid.
    """
    if not token:
        return None
    t = str(token).strip()
    t = re.sub(_APOST, "", t)
    t = re.sub(r"\s+", "", t)
    t = re.sub(r"[\xa0\u202f]", "", t)  # nbsp / narrow nbsp
    # Trailing decorative dash after dot: 1200.- or 1200.–
    t = re.sub(r"\.[–\-]+\s*$", "", t)
    t = re.sub(r"[–\-]+\s*$", "", t)
    t = t.rstrip(".")
    if not t or not re.search(r"\d", t):
        return None

    # 1.200,50 — dot thousands, comma decimals (EU)
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+,\d{1,2}", t):
        return float(t.replace(".", "").replace(",", "."))

    # 1200,50 — decimal comma
    if re.fullmatch(r"\d+,\d{2}", t):
        return float(t.replace(",", "."))

    # 1.200 or 1.200.000 — dot as thousands only (no fractional part)
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", t):
        return float(t.replace(".", ""))

    # 1200.50 — could be thousands.decimal or decimal; if last group is 3 digits ambiguous
    if re.fullmatch(r"\d+\.\d{2}", t):
        head, tail = t.split(".", 1)
        if len(head) > 3:
            return float(t)  # e.g. 1200.50
        return float(t)  # 12.50

    # Plain integer
    if re.fullmatch(r"\d+", t):
        return float(t)

    return None


# CHF / Fr. before amount
_RE_CHF_LEAD = re.compile(
    r"(?:CHF|Fr\.?)\s*([\d'’\s\u00a0\u202f.`]+(?:[.,][\d–\-]+)?)",
    re.IGNORECASE,
)
# Amount before CHF / Fr
_RE_CHF_TRAIL = re.compile(
    r"(?<![\w./])(\d{1,3}(?:['’\s]\d{3})*(?:[.,]\d{2})?|\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+[.,]\d{2}|\d+)\s*(?:CHF|Fr\.?)(?![\w.])",
    re.IGNORECASE,
)


def _find_chf_price_in_text(raw: str) -> Optional[float]:
    """First clearly parseable CHF / Fr. price, or None."""
    if not raw:
        return None
    for m in _RE_CHF_LEAD.finditer(raw):
        val = _parse_price_token_to_float(m.group(1))
        if val is not None:
            return val
    for m in _RE_CHF_TRAIL.finditer(raw):
        val = _parse_price_token_to_float(m.group(1))
        if val is not None:
            return val
    return None


_RE_EUR = re.compile(
    r"(?:EUR|€)\s*([\d'’\s\u00a0\u202f.]+(?:[.,]\d{1,2})?)",
    re.IGNORECASE,
)


def _eur_presence_note(raw: str) -> str:
    """Non-CHF currency note for draft.notes (no conversion)."""
    m = _RE_EUR.search(raw)
    if not m:
        return ""
    val = _parse_price_token_to_float(m.group(1))
    if val is None:
        return "Preisangabe in EUR erkannt (nicht als CHF übernommen)."
    return f"Preisangabe EUR {val:.2f} (nicht als CHF übernommen)."


def extract_chf_price_and_currency_notes(raw: str) -> Tuple[Optional[float], str]:
    """
    Deterministic CHF price + optional EUR note. EUR never fills purchase_price_chf.
    """
    chf = _find_chf_price_in_text(raw)
    eur_note = ""
    if _RE_EUR.search(raw):
        eur_note = _eur_presence_note(raw)
    return chf, eur_note


# --- Product name cleanup (shop / SEO suffixes) ---


def clean_product_name(name: Optional[str]) -> str:
    """
    Prefer first segment before | or obvious " - " / en-dash shop suffixes.
    Conservative: keep original if shortening would likely damage a short title.
    """
    if name is None:
        return ""
    orig = str(name).strip()
    if not orig:
        return ""
    s = re.sub(r"\s+", " ", orig)
    if "|" in s:
        first = s.split("|", 1)[0].strip()
        if len(first) >= 2:
            return first[:200]
    m = re.match(r"^(.+?)\s+([-–—])\s+(.+)$", s)
    if m:
        left, dash, right = m.group(1).strip(), m.group(2), m.group(3).strip()
        # Require left part to look like a product phrase, not a code
        if len(left) >= 3 and (len(left) >= 6 or " " in left):
            if len(right) >= 3 and not re.search(r"\d{4,}", left):
                return left[:200]
    return orig[:200]


LLM_SYSTEM_PROMPT = """Du extrahierst strukturierte Inventardaten aus Produktbeschreibungen (Schweizer Kontext).
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown, ohne Code-Fences.

Regeln:
- Erfinde KEINE Preise, Artikelnummern, Daten oder URLs. Nur verwenden, was eindeutig im Text steht.
- Wenn etwas nicht sicher im Text steht: null und in field_status "missing" oder "review".
- Preis nur als CHF (purchase_price_chf als Zahl). Wenn nur EUR/USD: notes erwähnen, purchase_price_chf null.
- purchase_date nur als ISO-Datum (YYYY-MM-DD), wenn eindeutig; sonst null.
- product_url nur wenn eine klare http(s)-Produkt-URL im Text vorkommt; sonst null.
- field_status: für jedes Feld eines von: "present", "missing", "review" (review = unsicher/teilweise).
- warnings: kurze Hinweise auf Deutsch bei fehlenden oder unsicheren kritischen Feldern (code snake_case, severity info|warning).

JSON-Schema (Felder exakt):
{
  "name": string | null,
  "category": string | null,
  "brand": string | null,
  "purchase_price_chf": number | null,
  "purchase_date": string | null,
  "purchased_from": string | null,
  "supplier_article_number": string | null,
  "product_url": string | null,
  "notes": string | null,
  "field_status": { "<feldname>": "present"|"missing"|"review" },
  "warnings": [ { "code": string, "message": string, "severity": "info"|"warning" } ]
}
"""


def _fallback_draft_from_text(raw: str) -> Tuple[Dict[str, Any], str]:
    """Deterministic stub (Phase-1 style) when LLM unavailable or fails."""
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    first = lines[0] if lines else ""
    name_raw = (first[:200] if first else None) or "Vorschau-Artikel"
    name = clean_product_name(name_raw) or name_raw
    excerpt = raw.strip()[:MAX_EXCERPT_META]
    purchase_price_chf, eur_note = extract_chf_price_and_currency_notes(raw)
    notes = eur_note if eur_note else ""
    draft = {
        "name": name,
        "category": "",
        "brand": "",
        "total_quantity": 1,
        "condition": "",
        "status": "active",
        "purchase_price_chf": purchase_price_chf,
        "purchase_date": None,
        "purchased_from": "",
        "supplier_article_number": "",
        "product_url": None,
        "notes": notes,
    }
    return draft, excerpt


def _fallback_draft_from_url(user_url: str) -> Tuple[Dict[str, Any], str]:
    try:
        product_url = _normalize_product_url(user_url)
    except ValueError as e:
        raise ValueError(str(e)) from e
    host = urlparse(product_url).netloc or "Link"
    draft = {
        "name": f"Vorschau-Artikel ({host})",
        "category": "",
        "brand": "",
        "total_quantity": 1,
        "condition": "",
        "status": "active",
        "purchase_price_chf": None,
        "purchase_date": None,
        "purchased_from": "",
        "supplier_article_number": "",
        "product_url": product_url,
        "notes": "",
    }
    excerpt = user_url.strip()[:MAX_EXCERPT_META]
    return draft, excerpt


def _draft_keys_to_hints(field_status: Dict[str, Any]) -> Dict[str, str]:
    hints: Dict[str, str] = {}
    inventory_keys = {
        "name",
        "category",
        "brand",
        "purchase_price_chf",
        "purchase_date",
        "purchased_from",
        "supplier_article_number",
        "product_url",
        "notes",
    }
    for k, v in field_status.items():
        if k not in inventory_keys:
            continue
        if v == "missing":
            hints[k] = "missing"
        elif v == "review":
            hints[k] = "review"
    return hints


def _merge_product_url(user_url: Optional[str], extracted: Optional[str]) -> Optional[str]:
    if user_url and str(user_url).strip():
        try:
            return _normalize_product_url(user_url)
        except ValueError:
            pass
    if extracted and str(extracted).strip():
        try:
            return _normalize_product_url(extracted)
        except ValueError:
            return None
    return None


def extract_inventory_draft_from_text(
    text: str,
    source_type: Literal["url", "text"],
    *,
    user_product_url: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, str], List[Dict[str, Any]], str]:
    """
    LLM extraction + mapping to inventory draft. Returns (draft, field_hints, llm_warnings, version_label).
    On any failure, falls back to deterministic stub and version 'fallback_v1'.
    """
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    model = (os.environ.get("INVENTORY_IMPORT_MODEL") or "gpt-4o-mini").strip()
    if not api_key:
        if source_type == "url" and user_product_url:
            d, _ex = _fallback_draft_from_text(text or user_product_url)
            # Prefer URL-based name stub if text empty
            if not (text or "").strip():
                d, _ex = _fallback_draft_from_url(user_product_url)
        else:
            d, _ex = _fallback_draft_from_text(text or "")
        hints = {"name": "review", "purchase_price_chf": "review"}
        w = [
            {
                "code": "llm_disabled",
                "message": "OPENAI_API_KEY nicht gesetzt — deterministische Vorschau.",
                "severity": "info",
            }
        ]
        return d, hints, w, "fallback_v1"

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        user_msg = (
            f"Quelle: {source_type}\n"
            f"Benutzer-Produkt-URL (kann leer sein): {user_product_url or 'null'}\n\n"
            f"Produkttext:\n{text[:MAX_LLM_INPUT_CHARS]}"
        )
        comp = client.chat.completions.create(
            model=model,
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": LLM_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )
        raw_json = (comp.choices[0].message.content or "").strip()
        data = json.loads(raw_json)
    except Exception as e:
        logger.info("inventory_import_llm_failed type=%s", type(e).__name__)
        if source_type == "url" and user_product_url:
            d, _ = _fallback_draft_from_text(text or "")
            if not (text or "").strip():
                d, _ = _fallback_draft_from_url(user_product_url)
        else:
            d, _ = _fallback_draft_from_text(text or "")
        hints = {"name": "review", "purchase_price_chf": "review"}
        w = [
            {
                "code": "llm_fallback",
                "message": "Automatische Extraktion fehlgeschlagen — einfache Vorschau verwendet.",
                "severity": "warning",
            }
        ]
        return d, hints, w, "fallback_v1"

    field_status = data.get("field_status") if isinstance(data.get("field_status"), dict) else {}
    llm_warnings = data.get("warnings") if isinstance(data.get("warnings"), list) else []
    llm_warnings = [w for w in llm_warnings if isinstance(w, dict)]

    def _s(key: str, default: str = "") -> str:
        v = data.get(key)
        if v is None:
            return default
        return str(v).strip()

    name = _s("name") or None
    purchase_date = None
    pd = data.get("purchase_date")
    if pd is not None and str(pd).strip():
        pds = str(pd).strip()[:32]
        if re.match(r"^\d{4}-\d{2}-\d{2}$", pds):
            purchase_date = pds

    pp = data.get("purchase_price_chf")
    purchase_price_chf: Optional[float] = None
    if pp is not None and pp != "":
        try:
            purchase_price_chf = float(pp)
        except (TypeError, ValueError):
            purchase_price_chf = None

    extracted_url = data.get("product_url")
    product_url = _merge_product_url(user_product_url, extracted_url if isinstance(extracted_url, str) else None)

    draft: Dict[str, Any] = {
        "name": name or "",
        "category": _s("category"),
        "brand": _s("brand") or None,
        "total_quantity": 1,
        "condition": "",
        "status": "active",
        "purchase_price_chf": purchase_price_chf,
        "purchase_date": purchase_date,
        "purchased_from": _s("purchased_from") or None,
        "supplier_article_number": _s("supplier_article_number") or None,
        "product_url": product_url,
        "notes": _s("notes") or None,
    }
    if draft["brand"] is None:
        draft["brand"] = ""
    if draft["purchased_from"] is None:
        draft["purchased_from"] = ""
    if draft["supplier_article_number"] is None:
        draft["supplier_article_number"] = ""
    if draft["notes"] is None:
        draft["notes"] = ""

    # Deterministic CHF from source text if model left price empty; EUR → notes only
    if draft.get("purchase_price_chf") is None and text:
        filled = _find_chf_price_in_text(text)
        if filled is not None:
            draft["purchase_price_chf"] = filled
    _, eur_note = extract_chf_price_and_currency_notes(text)
    if eur_note and eur_note not in (draft.get("notes") or ""):
        n = (draft.get("notes") or "").strip()
        draft["notes"] = f"{n} {eur_note}".strip() if n else eur_note

    orig_n = (draft.get("name") or "").strip()
    cleaned_n = clean_product_name(orig_n)
    draft["name"] = cleaned_n if cleaned_n else orig_n

    hints = _draft_keys_to_hints(field_status)
    if not (draft.get("name") or "").strip():
        hints["name"] = "missing"
    else:
        if hints.get("name") == "missing":
            del hints["name"]
        hints.setdefault("name", "review")
    if hints.get("purchase_price_chf") != "missing":
        hints.setdefault("purchase_price_chf", "review")

    return draft, hints, llm_warnings, "llm_v2"


def build_import_preview_response(
    body: Any,
    request_id: str,
) -> Dict[str, Any]:
    """
    Full Phase-1-compatible response. Never raises for LLM/fetch failures — warnings carry state.
    Input validation (empty url/text) should be handled by caller (HTTP 422).
    """
    t0 = time.perf_counter()
    source_type: Literal["url", "text"] = body.source_type
    warnings: List[Dict[str, Any]] = []
    excerpt = ""
    input_len = 0

    try:
        if source_type == "url":
            raw_url = (body.url or "").strip()
            try:
                normalized_url = _normalize_product_url(raw_url)
            except ValueError as e:
                raise ValueError(str(e)) from e

            fetch_text, _page_title, fetch_warnings = fetch_url_safe(normalized_url, request_id=request_id)
            warnings.extend(fetch_warnings)
            base_text = fetch_text or ""
            if _page_title and base_text:
                combined = f"{_page_title}\n\n{base_text}"
            elif _page_title:
                combined = _page_title
            else:
                combined = base_text
            if not combined.strip():
                # Fetch failed or empty HTML — still run extraction on URL string minimal context
                combined = f"URL: {normalized_url}\n(Titel/Text konnte nicht geladen werden.)"
                warnings.append(
                    {
                        "code": "empty_page_text",
                        "message": "Kein lesbarer Text von der Seite — bitte Daten manuell prüfen.",
                        "severity": "warning",
                    }
                )

            excerpt = (combined or raw_url)[:MAX_EXCERPT_META]
            text_in = normalize_text_for_llm(combined)
            input_len = len(text_in)
            draft, field_hints, llm_w, extraction_version = extract_inventory_draft_from_text(
                text_in,
                "url",
                user_product_url=normalized_url,
            )
            warnings.extend(llm_w)
            # Ensure product_url from user when LLM omitted
            if not draft.get("product_url"):
                draft["product_url"] = normalized_url
        else:
            raw = (body.text or "").strip()
            excerpt = raw[:MAX_EXCERPT_META]
            text_in = normalize_text_for_llm(raw)
            input_len = len(text_in)
            draft, field_hints, llm_w, extraction_version = extract_inventory_draft_from_text(
                text_in,
                "text",
                user_product_url=None,
            )
            warnings.extend(llm_w)

        # Trust message for LLM path
        if extraction_version == "llm_v2":
            warnings.append(
                {
                    "code": "review_required",
                    "message": "Bitte alle automatisch erkannten Felder vor dem Speichern prüfen.",
                    "severity": "info",
                }
            )
        else:
            warnings.append(
                {
                    "code": "preview_fallback",
                    "message": "Einfache oder Fallback-Vorschau — bitte alle Felder prüfen.",
                    "severity": "info",
                }
            )

        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "inventory_import_preview ok request_id=%s source_type=%s input_len=%s excerpt_len=%s ms=%s version=%s",
            request_id,
            source_type,
            input_len,
            len(excerpt),
            elapsed_ms,
            extraction_version,
        )
        return {
            "draft": draft,
            "field_hints": field_hints,
            "warnings": warnings,
            "meta": {
                "source_type": source_type,
                "source_excerpt": excerpt,
                "extraction_version": extraction_version,
                "request_id": request_id,
            },
        }
    except ValueError as e:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "inventory_import_preview validation request_id=%s ms=%s err=%s",
            request_id,
            elapsed_ms,
            type(e).__name__,
        )
        raise
    except Exception as e:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "inventory_import_preview error request_id=%s ms=%s type=%s",
            request_id,
            elapsed_ms,
            type(e).__name__,
        )
        # Last-resort safe payload
        excerpt = ""
        try:
            if body.source_type == "url":
                excerpt = (body.url or "").strip()[:MAX_EXCERPT_META]
            else:
                excerpt = (body.text or "").strip()[:MAX_EXCERPT_META]
        except Exception:
            pass
        d, _ = _fallback_draft_from_text(excerpt or " ")
        return {
            "draft": d,
            "field_hints": {"name": "review", "purchase_price_chf": "review"},
            "warnings": [
                {
                    "code": "preview_error",
                    "message": "Vorschau konnte nicht vollständig erstellt werden — bitte manuell prüfen.",
                    "severity": "warning",
                }
            ],
            "meta": {
                "source_type": getattr(body, "source_type", "text"),
                "source_excerpt": excerpt,
                "extraction_version": "error_fallback",
                "request_id": request_id,
            },
        }
