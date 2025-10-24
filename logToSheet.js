"use strict";

/**
 * Lightweight logger that writes messages to a Google Sheet.
 *
 * @param {Object} options - Configuration options.
 * @param {string} options.sheet - Target sheet name.
 * @param {string} [options.timeZone="UTC"] - Time zone for timestamp.
 * @param {string} [options.spreadsheetId] - Optional spreadsheet ID to log to.
 * @param {number} [options.maxBuffer=500] - Max logs to buffer before auto flush.
 */
class LogToSheet {
  constructor(options) {
    if (!options || !options.sheet) {
      throw new Error("LogToSheet requires a 'sheet' option.");
    }

    this.sheetName = options.sheet;
    this.timeZone = options.timeZone || "UTC";

    // Error handling for spreadsheet access
    try {
      if (options.spreadsheetId) {
        this.spreadsheet = SpreadsheetApp.openById(options.spreadsheetId);
      } else {
        this.spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      }
    } catch (e) {
      throw new Error("Failed to access spreadsheet: " + e.message + ". " +
        "Ensure the script has proper permissions and the spreadsheet ID is valid.");
    }

    this.maxBuffer = 500;
    if (options.maxBuffer !== undefined) {
      if (!Number.isInteger(options.maxBuffer) || options.maxBuffer <= 0) {
        throw new Error("The 'maxBuffer' option must be a positive integer.");
      }
      this.maxBuffer = options.maxBuffer;
    }

    this.sheet = this.spreadsheet.getSheetByName(this.sheetName);
    this.logs = [];
    this._flushing = false;
  }

  /**
   * Queues a message for logging.
   * @param {*} log - The message to log.
   */
  insert(log) {
    if (log == null) return;
    // If buffer has 3-column logs (from level methods), flush first to prevent mixed formats
    if (this.logs.length > 0 && this.logs[0].length === 3) {
      this.flush();
    }
    var timestamp = Utilities.formatDate(new Date(), this.timeZone, "yyyy-MM-dd HH:mm:ss");
    this.logs.push([timestamp, log]);
    if (this.logs.length >= this.maxBuffer) {
      this.flush();
    }
  }

  /**
   * Logs a message with a specific level.
   * @param {string} level - The log level.
   * @param {*} message - The message to log.
   * @private
   */
  _logWithLevel(level, message) {
    if (message == null) return;
    // If buffer has 2-column logs (from insert), flush first to prevent mixed formats
    if (this.logs.length > 0 && this.logs[0].length === 2) {
      this.flush();
    }
    var timestamp = Utilities.formatDate(new Date(), this.timeZone, "yyyy-MM-dd HH:mm:ss");
    this.logs.push([timestamp, level, String(message)]);
    if (this.logs.length >= this.maxBuffer) {
      this.flush();
    }
  }

  /** Log a message at INFO level */
  info(message) {
    this._logWithLevel("INFO", message);
  }

  /** Log a message at DEBUG level */
  debug(message) {
    this._logWithLevel("DEBUG", message);
  }

  /** Log a message at WARN level */
  warn(message) {
    this._logWithLevel("WARN", message);
  }

  /** Log a message at ERROR level */
  error(message) {
    this._logWithLevel("ERROR", message);
  }

  /**
   * Writes queued logs to the sheet with retry logic and concurrency protection.
   * @param {number} [maxRetries=3] - Maximum number of retry attempts on failure.
   */
  flush(maxRetries) {
    // Concurrency protection: prevent simultaneous flushes
    if (this._flushing) {
      Logger.log('LogToSheet: Flush already in progress, skipping duplicate flush call');
      return;
    }

    if (this.logs.length === 0) return;

    // Default to 3 retries if not specified
    if (maxRetries === undefined) {
      maxRetries = 3;
    }

    this._flushing = true;
    var logsToFlush = this.logs.slice(); // Create a copy to avoid race conditions
    var lastError = null;

    try {
      for (var attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Get or create sheet
          if (this.sheet == null) {
            this.sheet = this.spreadsheet.getSheetByName(this.sheetName);
            if (this.sheet == null) {
              this.sheet = this.spreadsheet.insertSheet(this.sheetName);
            }
          }

          // Add header when empty and using level logs
          if (this.sheet.getLastRow() === 0 && logsToFlush[0].length === 3) {
            this.sheet.appendRow(['Timestamp', 'Level', 'Message']);
          }

          var lastRow = this.sheet.getLastRow();
          if (lastRow + logsToFlush.length > this.sheet.getMaxRows()) {
            this.sheet.insertRowsAfter(lastRow, logsToFlush.length);
          }

          var colCount = logsToFlush[0].length;
          var range = this.sheet.getRange(lastRow + 1, 1, logsToFlush.length, colCount);
          range.setValues(logsToFlush);

          // Success! Clear the buffer and return
          this.logs = [];
          return;

        } catch (e) {
          lastError = e;
          Logger.log('LogToSheet: Flush attempt ' + (attempt + 1) + ' failed: ' + e.message);

          // If this isn't the last attempt, wait before retrying (exponential backoff)
          if (attempt < maxRetries - 1) {
            var waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            Logger.log('LogToSheet: Retrying in ' + (waitTime / 1000) + ' seconds...');
            Utilities.sleep(waitTime);
          }
        }
      }

      // All retry attempts failed
      throw new Error('LogToSheet: Failed to flush logs after ' + maxRetries +
        ' attempts. Last error: ' + lastError.message);

    } finally {
      this._flushing = false;
    }
  }
}
