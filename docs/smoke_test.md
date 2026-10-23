# Clinova Healthcare API — Smoke Test Suite

This document contains automated and manual smoke tests for the Clinova Healthcare REST API.
Base URL: `http://127.0.0.1:8000/api`

---

## 1. Quick PowerShell Runner

Run this entire block in PowerShell to test login and verify one live endpoint per resource group:

```powershell
$baseUrl = "http://127.0.0.1:8000/api"

Write-Host "=== 1. AUTH: Admin Login ===" -ForegroundColor Cyan
$loginBody = @{ username = "admin"; password = "Admin@123" } | ConvertTo-Json
$authRes = Invoke-RestMethod -Uri "$baseUrl/auth/login/" -Method Post -Body $loginBody -ContentType "application/json"
$token = $authRes.access
Write-Host "Success! Logged in as: $($authRes.user.name) (Role: $($authRes.user.role))" -ForegroundColor Green

$headers = @{ Authorization = "Bearer $token" }

Write-Host "`n=== 2. AUTH: Profile /me ===" -ForegroundColor Cyan
$me = Invoke-RestMethod -Uri "$baseUrl/auth/me/" -Method Get -Headers $headers
Write-Host "Profile confirmed: $($me.name) <$($me.username)>" -ForegroundColor Green

Write-Host "`n=== 3. ADMIN: Dashboard KPIs ===" -ForegroundColor Cyan
$adminDash = Invoke-RestMethod -Uri "$baseUrl/dashboard/admin/" -Method Get -Headers $headers
Write-Host "Admin KPIs: Staff=$($adminDash.staffCount), Active Doctors=$($adminDash.activeDoctors), Appointments Today=$($adminDash.todayAppointments)" -ForegroundColor Green

Write-Host "`n=== 4. RECEPTION: Patients List & Search ===" -ForegroundColor Cyan
$patients = Invoke-RestMethod -Uri "$baseUrl/patients/?search=Arun" -Method Get -Headers $headers
Write-Host "Patients matching 'Arun': $($patients.count) found. First: $($patients.results[0].name) (MRN: $($patients.results[0].mrn))" -ForegroundColor Green

Write-Host "`n=== 5. DOCTOR: Doctors Directory (Fee in paise) ===" -ForegroundColor Cyan
$doctors = Invoke-RestMethod -Uri "$baseUrl/doctors/" -Method Get -Headers $headers
Write-Host "Doctors count: $($doctors.count). First: $($doctors.results[0].name) - Fee: $($doctors.results[0].consultationFee) paise (₹$($doctors.results[0].consultationFee / 100))" -ForegroundColor Green

Write-Host "`n=== 6. PHARMACY: Medicines & Stock Alerts ===" -ForegroundColor Cyan
$alerts = Invoke-RestMethod -Uri "$baseUrl/medicines/stock-alerts/" -Method Get -Headers $headers
Write-Host "Stock alerts: Low stock items = $($alerts.lowStock.Count), Expiring soon = $($alerts.expiringSoon.Count)" -ForegroundColor Green

Write-Host "`n=== 7. LAB: Test Catalog ===" -ForegroundColor Cyan
$catalog = Invoke-RestMethod -Uri "$baseUrl/lab-catalog/" -Method Get -Headers $headers
Write-Host "Lab Catalog count: $($catalog.count). First: $($catalog.results[0].testName) (Price: $($catalog.results[0].price) paise)" -ForegroundColor Green

Write-Host "`n===============================================" -ForegroundColor Cyan
Write-Host "ALL SMOKE TESTS COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Cyan
```

---

## 2. cURL Commands (Command Prompt / Linux / macOS)

### 1. Login (Public)
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "Admin@123"}'
```
*Save the returned `access` token as `TOKEN` for subsequent requests.*

### 2. Auth: Profile (`/auth/me/`)
```bash
curl -X GET http://127.0.0.1:8000/api/auth/me/ \
  -H "Authorization: Bearer <TOKEN>"
```

### 3. Admin: Dashboard KPIs (`/dashboard/admin/`)
```bash
curl -X GET http://127.0.0.1:8000/api/dashboard/admin/ \
  -H "Authorization: Bearer <TOKEN>"
```

### 4. Reception: Patient Search (`/patients/?search=Arun`)
```bash
curl -X GET "http://127.0.0.1:8000/api/patients/?search=Arun" \
  -H "Authorization: Bearer <TOKEN>"
```

### 5. Doctor: Doctors List with Fee in Paise (`/doctors/`)
```bash
curl -X GET http://127.0.0.1:8000/api/doctors/ \
  -H "Authorization: Bearer <TOKEN>"
```

### 6. Pharmacy: Stock Alerts (`/medicines/stock-alerts/`)
```bash
curl -X GET http://127.0.0.1:8000/api/medicines/stock-alerts/ \
  -H "Authorization: Bearer <TOKEN>"
```

### 7. Lab: Lab Catalog (`/lab-catalog/`)
```bash
curl -X GET http://127.0.0.1:8000/api/lab-catalog/ \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 3. Demo Login Credentials

| Role | Username | Password | Staff Name |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin` | `Admin@123` | Rajesh Kumar |
| **DOCTOR** | `dr.sarah` | `Doctor@123` | Dr. Sarah Thomas |
| **DOCTOR** | `dr.priya` | `Doctor@123` | Dr. Priya Nambiar |
| **DOCTOR** | `dr.anil` | `Doctor@123` | Dr. Anil Kumar |
| **RECEPTIONIST** | `reception1` | `Reception@123` | Anjali Menon |
| **RECEPTIONIST** | `reception2` | `Reception@123` | Deepa Vijayan |
| **PHARMACIST** | `pharmacy1` | `Pharmacy@123` | Lakshmi Devi |
| **LAB_TECH** | `lab1` | `Lab@123` | Arjun Pillai |
