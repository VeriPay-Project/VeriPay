from pydantic import BaseModel


class VendorCreate(BaseModel):
    vendor_name: str
    public_key_fingerprint: str | None = None


class VendorResponse(BaseModel):
    vendor_id: int
    vendor_name: str
    public_key_fingerprint: str | None = None
    status: str

    class Config:
        from_attributes = True


class PlaidLinkTokenResponse(BaseModel):
    link_token: str


class PlaidPublicTokenExchangeRequest(BaseModel):
    public_token: str
