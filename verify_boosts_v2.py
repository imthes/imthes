from playwright.sync_api import sync_playwright
import time

def verify_boosts_and_animation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a mobile viewport size
        page = browser.new_page(viewport={'width': 430, 'height': 932})

        print("Navigating to app...")
        page.goto("http://localhost:5000")

        # Wait for app wrapper
        page.wait_for_selector(".desktop-wrapper")

        # Initial State
        page.screenshot(path="verification_v2/1_home.png")

        # Give ourselves money via JS
        print("Injecting balance...")
        page.evaluate("""() => {
            const state = JSON.parse(localStorage.getItem('tgm_state')) || {};
            state.balance = 1000;
            localStorage.setItem('tgm_state', JSON.stringify(state));
        }""")
        page.reload()
        time.sleep(1) # Allow state load

        # Go to Shop
        print("Clicking Shop nav...")
        page.click("a[href='#/shop']")
        time.sleep(1) # Wait for view transition
        page.screenshot(path="verification_v2/2_shop.png")

        # Buy First Item
        print("Buying boost...")
        # Locator for the button in the first card of shop list
        # Using a more robust selector
        buy_btn = page.locator("#shop-list .card").first.locator("button")

        # Ensure it's visible
        if buy_btn.is_visible():
            buy_btn.click()
            # The click triggers an async fetch then animation.
            # Capture the burst animation immediately?
            # Or wait slightly.
            time.sleep(0.2)
            page.screenshot(path="verification_v2/3_boost_animation.png")
            print("Animation captured.")

            # Wait for alert or UI update (button changes to 'Active')
            time.sleep(1)
            page.screenshot(path="verification_v2/4_post_buy.png")
        else:
            print("Buy button not visible!")

        browser.close()

if __name__ == "__main__":
    verify_boosts_and_animation()
