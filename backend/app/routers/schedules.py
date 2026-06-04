from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_owner
from app.models import Resource, Schedule, ScheduleException, User
from app.schemas.schedule import (
    ScheduleCreate,
    ScheduleExceptionCreate,
    ScheduleExceptionOut,
    ScheduleOut,
)

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _owned_resource(db: Session, resource_id: int, tenant_id: int) -> Resource:
    resource = db.get(Resource, resource_id)
    if not resource or resource.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    return resource


@router.get("", response_model=list[ScheduleOut])
def list_schedules(
    resource_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Schedule]:
    stmt = (
        select(Schedule)
        .join(Resource, Schedule.resource_id == Resource.id)
        .where(Resource.tenant_id == user.tenant_id)
    )
    if resource_id is not None:
        stmt = stmt.where(Schedule.resource_id == resource_id)
    return list(db.scalars(stmt.order_by(Schedule.day_of_week, Schedule.start_time)))


@router.post("", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
def create_schedule(
    payload: ScheduleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> Schedule:
    _owned_resource(db, payload.resource_id, user.tenant_id)
    schedule = Schedule(**payload.model_dump())
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> None:
    schedule = db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    _owned_resource(db, schedule.resource_id, user.tenant_id)
    db.delete(schedule)
    db.commit()


# --- Date exceptions (holidays / vacation / custom hours) -------------------

@router.get("/exceptions", response_model=list[ScheduleExceptionOut])
def list_exceptions(
    resource_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ScheduleException]:
    _owned_resource(db, resource_id, user.tenant_id)
    return list(
        db.scalars(
            select(ScheduleException)
            .where(ScheduleException.resource_id == resource_id)
            .order_by(ScheduleException.date)
        )
    )


@router.post("/exceptions", response_model=ScheduleExceptionOut, status_code=status.HTTP_201_CREATED)
def create_exception(
    payload: ScheduleExceptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> ScheduleException:
    _owned_resource(db, payload.resource_id, user.tenant_id)
    existing = db.scalar(
        select(ScheduleException).where(
            ScheduleException.resource_id == payload.resource_id,
            ScheduleException.date == payload.date,
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "There is already an exception for that date")
    exc = ScheduleException(**payload.model_dump())
    db.add(exc)
    db.commit()
    db.refresh(exc)
    return exc


@router.delete("/exceptions/{exception_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exception(
    exception_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
) -> None:
    exc = db.get(ScheduleException, exception_id)
    if not exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exception not found")
    _owned_resource(db, exc.resource_id, user.tenant_id)
    db.delete(exc)
    db.commit()
