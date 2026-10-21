# Windows Offline Distribution

## Customer installer

The Windows release produces one customer-facing `*-setup.exe` file. It contains the compiled desktop application and the bundled local API; do not send the GitHub source repository, Python files, or build intermediates. GitHub stores the build artifact for 30 days. For delivery, download the installer and share the installer itself through your chosen private file-transfer service.

Install the setup file on the customer's Windows 10/11 computer and launch SHOPNEX from the Start menu or desktop shortcut. The app and its SQLite database run locally. No device-activation code or internet connection is required to install or use the program after the required Windows WebView2 runtime is available. On a clean computer, verify WebView2 before installation; unsigned builds can also display a Windows SmartScreen unknown-publisher warning.

## Local employee accounts and permissions

On first launch, create the local owner account. Sign in as that administrator and open **Users & permissions** to create an individual username and password for each employee. The page includes ready-made Administrator, Manager, Accountant, Warehouse, and Cashier roles, plus a custom role. The owner can enable or disable each module's view/manage permissions for an account. Use a unique password of at least 12 characters; never share the administrator account with staff. Disabling a user blocks their next API request, and the application protects the last active administrator from being disabled or demoted.

The application remains offline-first and does not synchronize these accounts or records to a cloud service. Each Windows installation/profile has its own local database under the app's user-data folder. Moving the installer to another computer installs the program but does **not** move the old computer's business data; use a separately secured backup/restore process if data migration is needed.

## Source and release security

Keep the GitHub repository private and deliver only the compiled installer. This release intentionally does not enforce a device-bound product key, so the installer can be copied to another computer. Private source access and employee account permissions are separate matters: hiding source does not make a binary uncopyable, and local administrator access can modify local files. Use Windows account controls, backups, and code signing if you need stronger commercial distribution safeguards.

## Acceptance checks before sale

Test the exact installer on a clean Windows 10/11 device: install, create the owner account, create a cashier and a warehouse user, verify each can only access its assigned modules, create a test sale, restart the app, and confirm the database persists. Confirm the app starts with Wi-Fi disabled once Windows prerequisites are present. Keep an encrypted backup of customer data and test restoring that backup before relying on it.

The existing public GitHub Pages demo is separate from the private desktop release. Do not use it for live business data.
