from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # iPhone 13 Pro viewport
        page = browser.new_page(viewport={"width": 390, "height": 844})

        page.goto("http://localhost:5000/")
        page.wait_for_selector("#app")

        # Take high-res screenshot of Home (Buttons)
        page.screenshot(path="verification_v2/realistic_buttons.png")

        browser.close()

if __name__ == "__main__":
    run()