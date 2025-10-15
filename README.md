# 🏙️ Suburb Properties — Investor Dashboard

A lightweight **Flask + Vanilla JS** web app built using the **Microburbs Sandbox API**, turning raw suburb property data into investor-friendly insights.

This project demonstrates API integration, data transformation, and clear visualization using **Chart.js**, helping investors interpret price, land, and market metrics at a glance.

---

##  Features

- **Live API Integration** with Microburbs Sandbox  
  Fetch suburb-level listings, prices, land sizes, and property details.
- **Interactive Charts** (Chart.js)
  - Median Price by Bedrooms  
  - Price vs Land Size (scatter)
  - Bedroom Mix (doughnut)
  - Price per sqm & Days on Market (limited data in Sandbox)
- **Responsive Dashboard** built with TailwindCSS  
  Clean layout with automatic resizing and dynamic filtering.
- **Smart Data Summaries**
  - Median Price  
  - Median Price per sqm  
  - Median Days on Market  
  - Total Listings Count  

---

## 🧠 How It Works

1. Enter a suburb (e.g. **Belmont North**) and select a property type.  
2. The app sends an authenticated request to:
3. The backend (`Flask`) processes the JSON and enriches it with:
- Price per sqm  
- Price per bedroom  
- Days on market (listing age)
4. The frontend (`/static/app.js`) renders charts and an interactive table.

---

## 🖼️ Screenshots

| Dashboard Overview | Charts | Listings Table |
|--------------------|--------|----------------|
| ![Dashboard](https://github.com/ompatil21/Microburbs/blob/main/screenshots/Screenshot%202025-10-15%20132918.png?raw=true) | ![Charts](https://github.com/ompatil21/Microburbs/blob/main/screenshots/Screenshot%202025-10-15%20132854.png?raw=true) | ![Listings](https://github.com/ompatil21/Microburbs/blob/main/screenshots/Screenshot%202025-10-15%20132938.png?raw=true) |

---

## 🧩 Tech Stack

- **Backend:** Flask (Python)  
- **Frontend:** Vanilla JS, Chart.js, TailwindCSS  
- **Data Source:** Microburbs Sandbox API  
- **Deployment Ready:** Localhost or lightweight container setup  

---

## 🧪 Setup Instructions

```bash
# Clone this repository
git clone https://github.com/yourusername/microburbs-dashboard.git
cd microburbs-dashboard

# Install dependencies
pip install flask requests

# Run locally
python app.py

