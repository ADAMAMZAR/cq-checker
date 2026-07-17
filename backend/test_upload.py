import httpx
import json

url = "http://127.0.0.1:8000/api/audit"

# Form data (fields)
data = {
    "supplier_name": "Mock Supplier Ltd",
    "workspace_title": "Compliance Workspace 101",
    "cert_type": "QSHE",
    "qa_data": json.dumps({"Check Q1": "Passed", "Check Q2": "Valid"})
}

# Multipart Files (sent as byte content)
files = [
    ("files", ("dummy_cert.pdf", b"dummy certificate pdf content", "application/pdf")),
    ("screenshot", ("dummy_screenshot.png", b"dummy screenshot image content", "image/png"))
]

print("Sending POST request to /api/audit...")
try:
    response = httpx.post(url, data=data, files=files, timeout=10.0)
    print(f"Status Code: {response.status_code}")
    print("Response JSON:")
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print(f"Error connecting to backend: {e}")
