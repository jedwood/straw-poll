# Straw Poll
Simple SMS Poll demo using Nexmo and PubNub

### To create your own:

1. Use the `gas.js` file as a template to [create your own Google Apps Script backend](https://medium.com/@silentrant/let-google-chew-the-cud-6ba00584b3d5).

2. Put your PubNub keys and channel name in the Apps script, and in the `main.js`.

3. Configure a Nexmo phone number to point to the URL that your Google Apps Script project generates when published.

4. Load the `index.html` file in any browser.

Then ask people to text `A`, `B`, `C`, or `D` and watch the responses roll in!