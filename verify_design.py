from playwright.sync_api import sync_playwright

def verify_design():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use iPhone 14 Pro Max viewport
        context = browser.new_context(viewport={'width': 430, 'height': 932})
        page = context.new_page()

        # We need to serve the files. Assuming python server is running on 8080 from previous steps.
        # If not running, we'd need to start it, but usually the tool context implies environment.
        # Let's check localhost:8080.
        url = "http://localhost:8080/static/index.html"

        try:
            print("1. Loading Home Page for Design Check...")
            page.goto(url)
            page.wait_for_selector("#tap-area")

            # Wait for any animations to settle
            page.wait_for_timeout(1000)

            # Screenshot 1: Home (Dark Mode, Glass, Gradient)
            page.screenshot(path="design_verification_home.png")
            print("Captured design_verification_home.png")

            # Check for specific computed styles to verify CSS application
            # e.g., backdrop-filter on .card
            blur_val = page.locator(".card").first.evaluate("el => getComputedStyle(el).backdropFilter")
            print(f"Card Backdrop Filter: {blur_val}")
            # Note: browsers might report 'none' if headless doesn't support it fully or syntax differs,
            # but visual screenshot is key.

            # Screenshot 2: Shop (List Group Style)
            print("2. Navigating to Shop...")
            page.click("a[href='#/shop']")
            # We changed boost-card to .list-item in app.js, so wait for that
            page.wait_for_selector("#shop-list .list-item")
            page.wait_for_timeout(500)

            page.screenshot(path="design_verification_shop.png")
            print("Captured design_verification_shop.png")

            print("Design Verification Complete.")

        except Exception as e:
            print(f"Error during verification: {e}")

        finally:
            browser.close()

if __name__ == "__main__":
    verify_design()
