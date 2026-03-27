"""
Admin unit documents: upload to R2, list metadata (org-scoped).
"""

import os
from typing import Any, List, Optional
from urllib.parse import urlparse, unquote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlmodel import Session, select

from auth.dependencies import get_current_organization, get_db_session, require_roles
from db.models import Unit, UnitDocument, User
from app.core.rate_limit import limiter
from app.core.r2_storage import (
    build_object_key,
    delete_object,
    generate_presigned_url,
    upload_bytes,
)


router = APIRouter(prefix="/api/admin", tags=["admin-unit-documents"])


def _doc_to_dict(d: UnitDocument) -> dict[str, Any]:
    return {
        "id": str(d.id),
        "organization_id": str(d.organization_id),
        "unit_id": str(d.unit_id),
        "file_name": d.file_name,
        "file_url": d.file_url,
        "file_size": d.file_size,
        "mime_type": d.mime_type,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "uploaded_by": str(d.uploaded_by) if d.uploaded_by else None,
    }


def _resolve_object_key(doc: UnitDocument) -> Optional[str]:
    """Prefer stored object_key; else derive from legacy file_url (public or path-style)."""
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


def _get_document_for_org(session: Session, document_id: str, org_id: str) -> UnitDocument:
    doc = session.get(UnitDocument, document_id)
    if not doc or str(getattr(doc, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/unit-documents")
def admin_list_unit_documents(
    unit_id: str = Query(..., description="Unit id"),
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session: Session = Depends(get_db_session),
):
    unit = session.get(Unit, unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")

    rows: List[UnitDocument] = list(
        session.exec(
            select(UnitDocument)
            .where(UnitDocument.unit_id == unit_id)
            .order_by(UnitDocument.created_at.desc())
        ).all()
    )
    return {"items": [_doc_to_dict(r) for r in rows]}


@router.get("/unit-documents/{document_id}/download")
def admin_unit_document_download(
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
        url = generate_presigned_url(key, expires_in=3600)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not generate download URL: {e}") from e
    return {"url": url}


@router.delete("/unit-documents/{document_id}")
def admin_delete_unit_document(
    document_id: str,
    org_id: str = Depends(get_current_organization),
    _=Depends(require_roles("admin", "manager")),
    session: Session = Depends(get_db_session),
):
    doc = _get_document_for_org(session, document_id, org_id)
    key = _resolve_object_key(doc)
    if key:
        try:
            delete_object(key)
        except RuntimeError:
            pass
        except Exception as e:
            raise HTTPException(status_code=502, detail="Could not delete file from storage") from e
    session.delete(doc)
    session.commit()
    return {"ok": True}


@router.post("/unit-documents")
@limiter.limit("60/minute")
def admin_create_unit_document(
    request: Request,
    unit_id: str = Form(...),
    file: UploadFile = File(...),
    org_id: str = Depends(get_current_organization),
    current_user: User = Depends(require_roles("admin", "manager")),
    session: Session = Depends(get_db_session),
):
    unit = session.get(Unit, unit_id)
    if not unit or str(getattr(unit, "organization_id", "")) != org_id:
        raise HTTPException(status_code=404, detail="Unit not found")

    raw_name = file.filename or "upload"
    body = file.file.read()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        key = build_object_key(unit_id, raw_name)
        mime = file.content_type or "application/octet-stream"
        upload_bytes(key, body, mime)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}") from e

    doc = UnitDocument(
        organization_id=org_id,
        unit_id=unit_id,
        file_name=raw_name,
        file_url="",
        object_key=key,
        file_size=len(body),
        mime_type=mime,
        uploaded_by=str(current_user.id),
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return _doc_to_dict(doc)
