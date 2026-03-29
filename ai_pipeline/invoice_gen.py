from fpdf import FPDF

class PreciseAmazon(FPDF):
    def header(self):
        # Amazon Logo/Text
        self.set_font("Helvetica", "B", 18)
        self.cell(100, 10, "Final Details for Order #114-9876543-2109876", ln=False)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(85, 85, 85)
        self.cell(90, 10, "Print this page for your records.", ln=True, align='R')
        
        self.set_draw_color(200, 200, 200)
        self.line(10, 22, 200, 22) # Thin separator line
        self.ln(5)

def create_precise_invoice(filename):
    pdf = PreciseAmazon()
    pdf.add_page()
    
    # Order Metadata Section
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(0)
    pdf.cell(100, 5, "Order Placed: January 14, 2026", ln=False)
    pdf.cell(90, 5, "Amazon.com order number: 114-9876543-2109876", ln=True, align='R')
    pdf.cell(100, 5, "Order Total: $482.49", ln=True)
    pdf.ln(8)

    # Address Blocks
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(63, 5, "Shipping Address")
    pdf.cell(63, 5, "Payment Method")
    pdf.cell(63, 5, "Billing Address")
    pdf.ln(6)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(50)
    # Row 1
    pdf.cell(63, 5, "Jane Doe")
    pdf.cell(63, 5, "Visa | Last digits: 4444")
    pdf.cell(63, 5, "Jane Doe")
    pdf.ln(5)
    # Row 2
    pdf.cell(63, 5, "123 Maple Street")
    pdf.cell(63, 5, "") # Empty column
    pdf.cell(63, 5, "123 Maple Street")
    pdf.ln(5)
    # Row 3
    pdf.cell(63, 5, "Springfield, IL 62704")
    pdf.cell(63, 5, "")
    pdf.cell(63, 5, "Springfield, IL 62704")
    pdf.ln(15)

    # Shipment Header
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(0)
    pdf.cell(0, 10, "Shipment 1 of 1", ln=True)
    pdf.set_draw_color(0)
    pdf.line(10, 78, 200, 78) # Heavy separator line
    pdf.ln(2)

    # Itemized Table
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(140, 8, "Items Shipped")
    pdf.cell(50, 8, "Price", align='R', ln=True)
    
    pdf.set_font("Helvetica", "", 9)
    items = [
        ("Sony WH-1000XM5 Wireless Noise Canceling Overhead Headphones", "$398.00"),
        ("Hard Travel Case for Sony XM5 - Black", "$24.99")
    ]
    
    for item, price in items:
        # Multi_cell handles long titles that wrap to the next line
        start_y = pdf.get_y()
        pdf.multi_cell(140, 5, f"1 of: {item}\nSold by: Amazon.com Services LLC\nCondition: New")
        end_y = pdf.get_y()
        pdf.set_xy(150, start_y)
        pdf.cell(50, 5, price, align='R')
        pdf.set_xy(10, end_y + 2)

    # Summary Section
    pdf.ln(10)
    pdf.set_draw_color(220)
    pdf.line(130, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(2)
    
    summary = [
        ("Item(s) Subtotal:", "$422.99"),
        ("Shipping & Handling:", "$5.99"),
        ("Free Shipping:", "-$5.99"),
        ("Total before tax:", "$422.99"),
        ("Estimated tax to be collected:", "$59.50")
    ]

    for label, value in summary:
        pdf.set_x(130)
        pdf.cell(40, 5, label)
        pdf.cell(30, 5, value, align='R', ln=True)

    pdf.set_x(130)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(40, 10, "Grand Total:")
    pdf.cell(30, 10, "$482.49", align='R', ln=True)

    pdf.output(filename)

if __name__ == "__main__":
    create_precise_invoice("amazon_precise_test.pdf")
    print("Precise Amazon Invoice Generated.")