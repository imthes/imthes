from playwright.sync_api import sync_playwright
import time

def verify_offline_mode():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 430, 'height': 932})

        # Correct path for python -m http.server (which serves root)
        url = "http://localhost:8080/static/index.html"
        print(f"Navigating to {url} ...")
        page.goto(url)

        # Wait for app wrapper
        try:
            page.wait_for_selector(".desktop-wrapper", timeout=5000)
        except:
            print("Failed to load app wrapper.")
            page.screenshot(path="verification_v2/fail_load.png")
            browser.close()
            return

        # Clear LS
        page.evaluate("localStorage.clear(); location.reload();")
        time.sleep(1)

        # Inject Balance
        print("Injecting balance...")
        page.evaluate("""() => {
            // Need to set UID to something consistent?
            const state = {
                balance: 1000,
                chat: { lastRewardTs: 0, cooldownSec: 60 },
                daily: { lastDailyTs: 0, cooldownSec: 86400 },
                miner: { status: 'idle', sessionEndTs: 0, lastClaimTs: 0 },
                tasks: { doneToday: 0, totalToday: 3 },
                // Let the app fill the shop items from default state
                shop: { items: [], dailyDealId: null },
                boosts: { inventory: [], active: [] },
                friends: { inviteCode: 'demo', stats: { invited: 0 }, list: [] }
            };
            localStorage.setItem('tgm_state', JSON.stringify(state));
        }""")
        page.reload()
        time.sleep(1)

        # Go to Shop
        print("Clicking Shop nav...")
        page.click("a[href='#/shop']")
        time.sleep(1)

        # Verify Items
        print("Verifying Boost Items...")
        items = page.locator("#shop-list .card")
        count = items.count()
        print(f"Found {count} items.")

        page.screenshot(path="verification_v2/5_offline_shop.png")

        if count == 0:
             print("FAIL: No items found. Default state logic broken?")
             browser.close()
             return

        # Buy
        print("Buying boost in offline mode...")
        buy_btn = items.first.locator("button")

        if buy_btn.is_visible():
            buy_btn.click()
            time.sleep(0.5)

            # Check for modal
            modal = page.locator(".success-overlay")
            if modal.is_visible():
                print("Success modal visible.")
                page.screenshot(path="verification_v2/6_offline_success.png")
            else:
                print("Warning: Success modal not visible.")

        else:
            print("Buy button not visible!")

        browser.close()

if __name__ == "__main__":
    verify_offline_mode()
