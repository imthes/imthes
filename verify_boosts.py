from playwright.sync_api import sync_playwright
import time

def verify_boosts_and_animation():
    with sync_playwright() as p:
        # Launch browser (desktop view to test responsiveness wrapper, but we want to see the mobile view)
        browser = p.chromium.launch(headless=True)
        # Create context with mobile viewport to ensure correct rendering inside the desktop wrapper or direct mobile
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:5000")

        # Wait for app to load
        page.wait_for_selector(".desktop-wrapper")

        # Initial Screenshot
        print("Taking initial screenshot...")
        page.screenshot(path="verification_v2/1_home.png")

        # Navigate to Shop
        print("Navigating to Shop...")
        # Click the Shop nav item
        page.click("a[href='#/shop']")
        time.sleep(1) # Wait for transition

        # Verify Shop Items present
        print("Verifying shop items...")
        boost_items = page.query_selector_all("#shop-list .card")
        if len(boost_items) >= 3:
            print(f"Found {len(boost_items)} shop items.")
        else:
            print(f"Warning: Found only {len(boost_items)} shop items.")

        page.screenshot(path="verification_v2/2_shop.png")

        # Buy a Boost (2x Speed - 100 TGM)
        # First, ensure we have money. Default is 0.
        # We need to cheat or click mine a lot.
        # Let's use localStorage manipulation to set balance for testing
        print("Setting balance to 1000 for testing...")
        page.evaluate("() => { localStorage.setItem('tgm_state', JSON.stringify({...JSON.parse(localStorage.getItem('tgm_state')), balance: 1000})); location.reload(); }")
        time.sleep(2)

        # Go back to shop
        page.click("a[href='#/shop']")
        time.sleep(1)

        # Click Buy on the first item
        print("Buying first boost...")
        # Find the button in the first card
        buy_btn = page.query_selector("#shop-list .card:first-child button")
        if buy_btn:
            buy_btn.click()
            time.sleep(0.5) # Wait for animation trigger

            # Screenshot the animation burst
            print("Capturing animation...")
            page.screenshot(path="verification_v2/3_boost_animation.png")

            # Wait a bit more for alert/update
            time.sleep(2)
            page.screenshot(path="verification_v2/4_post_buy.png")
        else:
            print("Buy button not found")

        browser.close()

if __name__ == "__main__":
    verify_boosts_and_animation()
