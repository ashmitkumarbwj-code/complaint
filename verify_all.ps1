$r1 = Invoke-RestMethod -Uri "https://gcd-smart-complaint-and-response-system.co.in/api/slides"
Write-Host "=== OLD /api/slides ===" 
Write-Host "success=$($r1.success) slides=$($r1.slides.Count) title=$($r1.slides[0].title)"

$r2 = Invoke-RestMethod -Uri "https://gcd-smart-complaint-and-response-system.co.in/api/dynamic-slides"
Write-Host "=== NEW /api/dynamic-slides ==="
Write-Host "success=$($r2.success) slides=$($r2.slides.Count)"

$hp = Invoke-WebRequest -Uri "https://gcd-smart-complaint-and-response-system.co.in/" -UseBasicParsing
Write-Host "=== HOMEPAGE ==="
Write-Host "HTTP: $($hp.StatusCode)"
Write-Host "dynamic-media-slider-section: $($hp.Content -match 'dynamic-media-slider-section')"
Write-Host "dynamicSlider.js script: $($hp.Content -match 'dynamicSlider.js')"
Write-Host "Old slider-track: $($hp.Content -match 'slider-track')"
Write-Host "Campus Highlights: $($hp.Content -match 'Campus Highlights')"

$adm = Invoke-WebRequest -Uri "https://gcd-smart-complaint-and-response-system.co.in/admin.html" -UseBasicParsing
Write-Host "=== ADMIN.HTML ==="
Write-Host "HTTP: $($adm.StatusCode)"
Write-Host "tab-dynamic-slides: $($adm.Content -match 'tab-dynamic-slides')"
Write-Host "Manage Dynamic Slides: $($adm.Content -match 'Manage Dynamic Slides')"
Write-Host "Add Dynamic Slide btn: $($adm.Content -match 'Add Dynamic Slide')"
Write-Host "dynamic-slides-tbody: $($adm.Content -match 'dynamic-slides-tbody')"
Write-Host "dynamicSlideModal: $($adm.Content -match 'dynamicSlideModal')"
Write-Host "OLD tab-slides present: $($adm.Content -match 'tab-slides')"
Write-Host "OLD slides-tbody present: $($adm.Content -match 'slides-tbody')"
Write-Host "OLD Hero Slider heading: $($adm.Content -match 'Homepage Hero Slider Manager')"

Write-Host "=== ADMIN ROUTE AUTH ==="
try {
    Invoke-RestMethod -Uri "https://gcd-smart-complaint-and-response-system.co.in/api/admin/dynamic-slides"
    Write-Host "UNEXPECTED 200 - no auth guard!"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body = $_.ErrorDetails.Message
    Write-Host "Status: $code"
    Write-Host "Body: $body"
}
