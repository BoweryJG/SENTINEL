#!/bin/bash

# SENTINEL Presentation Launcher

echo "🛡️  SENTINEL - The Standard of Care. Redefined."
echo "============================================"
echo ""
echo "Launching SENTINEL presentation suite..."
echo ""

# Check if Python is available for simple HTTP server
if command -v python3 &> /dev/null; then
    echo "Starting local server on http://localhost:8000"
    echo ""
    echo "📊 Main Pitch Deck: http://localhost:8000/index.html"
    echo "💰 ROI Calculator: http://localhost:8000/tools/roi-calculator.html"
    echo "🌐 Marketing Site: http://localhost:8000/marketing/landing-page.html"
    echo "📄 Business Plan: http://localhost:8000/documents/business-plan.md"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "Starting local server on http://localhost:8000"
    echo ""
    echo "📊 Main Pitch Deck: http://localhost:8000/index.html"
    echo "💰 ROI Calculator: http://localhost:8000/tools/roi-calculator.html"
    echo "🌐 Marketing Site: http://localhost:8000/marketing/landing-page.html"
    echo "📄 Business Plan: http://localhost:8000/documents/business-plan.md"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    python -m SimpleHTTPServer 8000
else
    echo "Python not found. Opening files directly..."
    # Try to open in default browser
    if command -v xdg-open &> /dev/null; then
        xdg-open index.html
    elif command -v open &> /dev/null; then
        open index.html
    else
        echo "Please open index.html in your web browser"
    fi
fi