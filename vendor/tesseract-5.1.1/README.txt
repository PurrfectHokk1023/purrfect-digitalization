Receipt reader for the Purrfect POS checkout (point-of-sale.html): OCR that runs in the buyer's browser.
From npm, integrity-checked 5 Nov 2026:
  tesseract.min.js, worker.min.js            tesseract.js 5.1.1 (dist/)             Apache-2.0
  tesseract-core-*-lstm.wasm.js              tesseract.js-core 5.1.1                Apache-2.0 (LICENSE)
  eng.traineddata.gz                         @tesseract.js-data/eng 1.0.0 (4.0.0_best_int)  Apache-2.0 (Tesseract models)
The page loads them only on the receipt step. A new version goes in a new folder, so browsers never mix cached files.
