from pydantic import BaseModel, Field, field_validator


class InvoiceVendorMatchRequest(BaseModel):
    vendor_name: str = Field(..., min_length=1)
    account_number: str = Field(..., min_length=1)
    bank_name: str = Field(..., min_length=1)
    country: str = Field(..., min_length=1)
    currency: str = Field(..., min_length=1)

    @field_validator("vendor_name", "account_number", "bank_name", "country", "currency")
    @classmethod
    def strip_required_strings(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned


class InvoiceVendorMatchBinding(BaseModel):
    account_masked: str | None = None
    country: str | None = None
    bank_name: str | None = None
    verification_source: str | None = None
    is_active: bool


class InvoiceVendorMatchDetails(BaseModel):
    vendor_name_matched: bool
    account_matched: bool
    country_matched: bool
    bank_name_matched: bool


class InvoiceVendorMatchResponse(BaseModel):
    status: str
    vendor_id: int | None = None
    binding_id: int | None = None
    confidence_score: int
    matched_binding: InvoiceVendorMatchBinding | None = None
    details: InvoiceVendorMatchDetails
