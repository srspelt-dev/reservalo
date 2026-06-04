from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ScheduleBase(BaseModel):
    resource_id: int
    day_of_week: int = Field(ge=0, le=6, description="0=Monday ... 6=Sunday")
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _check_times(self) -> "ScheduleBase":
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        return self


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    resource_id: int
    day_of_week: int
    start_time: time
    end_time: time


class ScheduleExceptionCreate(BaseModel):
    resource_id: int
    date: date
    is_closed: bool = True
    start_time: time | None = None
    end_time: time | None = None

    @model_validator(mode="after")
    def _check(self) -> "ScheduleExceptionCreate":
        if not self.is_closed:
            if not self.start_time or not self.end_time:
                raise ValueError("Custom hours require start_time and end_time")
            if self.start_time >= self.end_time:
                raise ValueError("start_time must be before end_time")
        return self


class ScheduleExceptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    resource_id: int
    date: date
    is_closed: bool
    start_time: time | None
    end_time: time | None
