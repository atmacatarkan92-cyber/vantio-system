"""
Admin tenant documents: upload to R2, list metadata (org-scoped).
Mirrors routes_admin_unit_documents for tenants.
"""

import os
from typing import Any, List, Optional
from urllib.parse import urlparse, unquote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlmodel import Session, select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.audit import create_audit_log
from db.models import Tenant, TenantDocument, User
from app.core.rate_limit import limiter
from app.core.r2_storage import (
    build_tenant_object_key,
    delete_object,
    generate_presigned_url,
    upload_bytes,
)


router = APIRouter(prefix="/api/admin", tags=["admin-tenant-documents"])


def _user_display_name(u: Optional[User]) -> str:
    if not u:
        return "—"
    fn = (getattr(u, "first_name", None) or "").strip()
    ln = (getattr(u, "last_name", None) or "").strip()
    if fn and ln:
        return f"{fn} {ln}"
    full = (getattr(u, "full_name", None) or "").strip()
    if full:
        return full
    em = (getattr(u, "email", None) or "").strip()
    if em:
        return em
    return "—"


def _normalize_category_optional(category: Optional[str]) -> Optional[str]:
    if category is None:
        return None
    s = str(category).strip()
    return s if s else None


def _doc_to_dict(d: TenantDocument, uploaded_by_name: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": str(d.id),
        "organization_id": str(d.organization_id),
        "tenant_id": str(d.tenant_id),
        "file_name": d.file_name,
        "file_url": d.file_url,
        "file_size": d.file_size,
        "mime_type": d.mime_type,
        "category": getattr(d, "category", None),
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "uploaded_by": str(d.uploaded_by) if d.uploaded_by else None,
        "uploaded_by_name": uploaded_by_name if uploaded_by_name is not None else "—",
    }


def _resolve_object_key(doc: TenantDocument) -> Optional[str]:
    ok = getattr(doc, "object_key", None)
    if ok and str(ok).strip():
        return str(ok).strip()
    url = (doc.file_url or "").strip()
    if not url:
        return None
    p = urlparse(url)
    path = unquote(p.path or "").lstrip("/")
    if not path:
        return None
    bucket = os.environ.get("R2_BUCKET_NAME", "").strip()
    if bucket and path.startswith(bucket + "/"):
        path = path[len(bucket) + 1 :]
    return path or None


def _get_document_for_org(session: Session, document_id: str, org_id: str) -> TenantDocument:
    doc = session.get(TenantDocument, document_id)
    if not doc or str(getattr(doc, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/tenant-documents")
def admin_list_tenant_documents(
    tenant_id: str = Query(..., description="Tenant id"),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session: Session = Depends(get_db_session),
):
    tenant = session.get(Tenant, tenant_id)
    if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenant not found")

    rows: List[TenantDocument] = list(
        session.exec(
            select(TenantDocument)
            .where(TenantDocument.tenant_id == tenant_id)
            .order_by(TenantDocument.created_at.desc())
        ).all()
    )
    uploaded_ids = {str(r.uploaded_by) for r in rows if r.uploaded_by}
    users_by_id: dict[str, User] = {}
    if uploaded_ids:
        id_list = list(uploaded_ids)
        users = session.exec(select(User).where(User.id.in_(id_list))).all()
        for u in users:
            users_by_id[str(u.id)] = u

    def name_for(doc: TenantDocument) -> str:
        if not doc.uploaded_by:
            return "—"
        return _user_display_name(users_by_id.get(str(doc.uploaded_by)))

    return {"items": [_doc_to_dict(r, name_for(r)) for r in rows]}


@router.get("/tenant-documents/{document_id}/download")
def admin_tenant_document_download(
    document_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session: Session = Depends(get_db_session),
):
    doc = _get_document_for_org(session, document_id, org_id)
    key = _resolve_object_key(doc)
    if not key:
        raise HTTPException(status_code=404, detail="Object key not available for this document")
    try:
        fn = (doc.file_name or "").strip() or None
        url = generate_presigned_url(key, expires_in=3600, download_filename=fn)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not generate download URL: {e}") from e
    return {"url": url}


@router.delete("/tenant-documents/{document_id}")
def admin_delete_tenant_document(
    document_id: str,
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session: Session = Depends(get_db_session),
):
    doc = _get_document_for_org(session, document_id, org_id)
    tenant_id = str(doc.tenant_id)
    deleted_name = doc.file_name or ""
    key = _resolve_object_key(doc)
    if key:
        try:
            delete_object(key)
        except RuntimeError:
            pass
        except Exception as e:
            raise HTTPException(status_code=502, detail="Could not delete file from storage") from e
    create_audit_log(
        session,
        str(current_user.id),
        "update",
        "tenant",
        tenant_id,
        old_values={"document_deleted": deleted_name},
        new_values=None,
    )
    session.delete(doc)
    session.commit()
    return {"ok": True}


@router.post("/tenant-documents")
@limiter.limit("60/minute")
def admin_create_tenant_document(
    request: Request,
    tenant_id: str = Form(...),
    file: UploadFile = File(...),
    category: Optional[str] = Form(default=None),
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session: Session = Depends(get_db_session),
):
    tenant = session.get(Tenant, tenant_id)
    if not tenant or str(getattr(tenant, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Tenant not found")

    raw_name = file.filename or "upload"
    body = file.file.read()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        key = build_tenant_object_key(tenant_id, raw_name)
        mime = file.content_type or "application/octet-stream"
        upload_bytes(key, body, mime)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}") from e

    doc = TenantDocument(
        organization_id=org_id,
        tenant_id=tenant_id,
        file_name=raw_name,
        file_url="",
        object_key=key,
        file_size=len(body),
        mime_type=mime,
        category=_normalize_category_optional(category),
        uploaded_by=str(current_user.id),
    )
    session.add(doc)
    create_audit_log(
        session,
        str(current_user.id),
        "update",
        "tenant",
        str(tenant_id),
        old_values=None,
        new_values={"document_uploaded": raw_name},
    )
    session.commit()
    session.refresh(doc)
    return _doc_to_dict(doc, _user_display_name(current_user))
