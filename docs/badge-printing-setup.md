# Setting up a badge printing desk

For whoever sets up the registration desks before an event. Allow about 15 minutes per desk.

When you're done, a desk lets people in and prints their badge in about two seconds, with no print window to click through.

## What each desk needs

- A Windows laptop or PC with Google Chrome.
- A badge printer, or an ordinary office printer with perforated A4 badge sheets.
- A USB QR scanner (recommended). Any scanner that "types" what it reads works, and most do out of the box. Without one, the desk can use the laptop's camera on Chrome for Android, ChromeOS or macOS, or type names.
- A console account that is **Door staff (session admin)**, **Event organiser** for this event, or **Admin**. Volunteers only need Door staff.

## 1. Set up the printer

1. Install the printer's driver from the manufacturer's website (Zebra, Brother, Epson and so on).
2. In Windows **Settings → Bluetooth & devices → Printers & scanners**, choose the printer and click **Set as default**.
   - Also turn **off** "Let Windows manage my default printer" on the same page, or Windows may switch the default back.
3. Under **Printing preferences**, set the paper size to the badge size chosen in the console:

   | Badge size in the console | Paper size on the printer |
   |---|---|
   | A6 | A6, 105 × 148 mm, portrait |
   | 4 × 3 in | 4 × 3 in, landscape |
   | ID card | CR80, 54 × 86 mm, portrait |
   | Any size on A4 sheets | A4 |

4. Set the margins to **none** or **borderless**, if the driver offers it.

## 2. Make the "no print window" shortcut

Chrome can print straight to the default printer, without showing the print window.

1. **Close every Chrome window first.** The setting only takes effect when Chrome starts.
2. Right-click the desktop → **New → Shortcut**.
3. For the location, paste this, replacing the address with your console's:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\PIC-desk" https://console.example.org/check-in
   ```

   - `--kiosk-printing` prints without the print window.
   - `--user-data-dir` gives the desk its own Chrome profile. The setting then applies even if someone else has Chrome open, and the desk's sign-in stays separate.
4. Name the shortcut **PIC check-in desk**.
5. Optional: to run the desk full screen with no address bar, add `--kiosk` after `--kiosk-printing`. You then quit with **Alt+F4**.

## 3. Sign in and test

1. Open the desk with the shortcut and sign in.
2. Choose the event at the top of the Check-in desk page.
3. Check that **Print a badge at check-in** is on. The setting is saved per computer.
4. Test it:
   - Go to **Badges**, open anyone's preview and click **Print badge**.
   - It should print at once, with no window. If a window appears, Chrome was already open when you used the shortcut: close every Chrome window and open the shortcut again.
5. Scan a test ticket. The screen should say **Welcome** and print the badge.

## On the day

- Keep the cursor in the big box. The desk puts it back there after every scan, so the scanner always works.
- **Already checked in** (amber) means the ticket has been used. Nobody else can come in on it. If it's the right person and they only need a new badge, click **Reprint badge**.
- **Not let in** (red) explains why, for example "This ticket is for GS-26". Send the person to the help desk.
- No QR? Type their name, email or ticket code, check it's them, and click **Check in**.
- The list on the right shows who came through this desk. Click the printer icon next to a name to reprint their badge.

## If a badge does not print

- **Nothing happens:**
  - Check the printer is on, has stock, and is still the Windows default.
  - The person is still checked in; use **Reprint badge** when the printer is back.
- **It prints the wrong size or cut off:** the printer's paper size doesn't match the badge size in **Badges → Design**. Fix it in the printer's Printing preferences.
- **The print window appears:** Chrome was started without the shortcut. Close every Chrome window and use the shortcut.
