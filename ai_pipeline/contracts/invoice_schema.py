INVOICE_SCHEMA = {
    "invoice_number": str | None,
    "vendor_name": str | None,
    "customer_name": str | None,
    "invoice_date": str | None,
    "subtotal": float | None,
    "tax": float | None,
    "total": float | None,
    "currency": str | None
}
