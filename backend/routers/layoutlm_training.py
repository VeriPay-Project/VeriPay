from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from conn_db import get_db
from dependencies import get_current_user
from models.user import User
from services.layoutlm_model_registry import list_layoutlm_models
from services.layoutlm_training_service import (
    get_layoutlm_dataset_summary,
    train_layoutlm_supervised_model,
)

router = APIRouter(prefix="/layoutlm", tags=["LayoutLMv3 Training"])


class TrainLayoutLMRequest(BaseModel):
    iterations: int = Field(default=200, ge=50, le=5000)
    epochs: int | None = Field(default=None, ge=1, le=100)
    min_samples: int = Field(default=2, ge=2, le=10000)
    test_size: float = Field(default=0.2, ge=0.1, le=0.5)


@router.get("/dataset-summary")
def dataset_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return get_layoutlm_dataset_summary(db, user.id)


@router.get("/models")
def models(
    user: User = Depends(get_current_user),
):
    return list_layoutlm_models(user.id)


@router.post("/train")
def train_model(
    body: TrainLayoutLMRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        model = train_layoutlm_supervised_model(
            db=db,
            user_id=user.id,
            iterations=body.iterations,
            epochs=body.epochs,
            min_samples=body.min_samples,
            test_size=body.test_size,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "status": "trained",
        "model": model,
        "models": list_layoutlm_models(user.id),
        "dataset": get_layoutlm_dataset_summary(db, user.id),
    }
