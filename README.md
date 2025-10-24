# LogToSheet
Lightweight in-sheet logging for Google Sheets. Intended to provide spreadsheet users with contextual information without having to navigate to Apps Script logs.

## Usage
Initialize a new instance of `LogToSheet`. The constructor accepts an options object. At a minimum you must provide the sheet name via the `sheet` option.
You can also optionally override the timestamp time zone with the `timeZone` option.
Optionally pass a `spreadsheetId` to log to a specific spreadsheet instead of the active one.
You can also optionally override the timestamp time zone with the `timeZone` option or configure how many logs are buffered before they are automatically flushed with the `maxBuffer` option.
```
const log = new LogToSheet({
  sheet: "Logs",
  // optional: timezone used for timestamps
  timeZone: "America/Los_Angeles",
  // optional: log to a specific spreadsheet
  spreadsheetId: "your-spreadsheet-id"
  // optional: maximum number of entries to buffer before flush
  maxBuffer: 1000
});
```
Insert new logs by calling the  ```insert``` method with 1 argument which is the value to log.  
You can also log with standard levels using `info`, `debug`, `warn`, and `error`.
```
log.insert("My first log");
log.info("App started");
log.debug("Debug details");
log.warn("Something looks off");
log.error("Something failed");
```
Output the logs to the sheet by calling `flush`. `flush` will attempt to create
the output sheet if it does not already exist. `flush` is also automatically
invoked when more than the configured `maxBuffer` value (default 500) entries have been queued.

The `flush()` method includes automatic retry logic with exponential backoff (3 attempts by default)
to handle transient Google Sheets API errors. You can optionally specify a different number of retries:
```
log.flush();      // Uses default 3 retries
log.flush(5);     // Custom retry count
```
## Output Format
Log entries written with the level methods contain 3 columns: the timestamp, the level, and the message. Entries written with `insert()` continue to produce 2 columns (timestamp and message).

**Important:** The logger automatically flushes the buffer when you switch between formats (e.g., from `insert()` to `info()`). This prevents mixing 2-column and 3-column rows in the same batch, which would cause write errors.
## Example
```
const log = new LogToSheet({
    sheet: "Logs",
    timeZone: "America/Los_Angeles",
    spreadsheetId: "your-spreadsheet-id"
});

for(let i = 1; i <= 100; i++) {
  log.debug(`Processing ${i}`);
}

log.info('All done');
log.flush();
```
<img width="230" alt="Screenshot 2023-01-21 134153" src="https://user-images.githubusercontent.com/49938659/213867317-d355350c-ea0e-4b2f-94bc-1e7ae6a32dc7.png">

## Error Handling & Reliability

### Automatic Retry Logic
The `flush()` method automatically retries failed writes up to 3 times (configurable) with exponential backoff:
- Attempt 1 fails → wait 1 second → retry
- Attempt 2 fails → wait 2 seconds → retry
- Attempt 3 fails → wait 4 seconds → retry
- All attempts fail → throws error

This handles transient API errors, rate limiting, and temporary network issues.

### Concurrency Protection
Multiple simultaneous calls to `flush()` are automatically handled. If a flush is already in progress, subsequent calls will be skipped to prevent race conditions.

### Constructor Validation
The constructor validates all inputs and provides clear error messages:
- Missing required `sheet` option
- Invalid `maxBuffer` value (must be positive integer)
- Spreadsheet access failures (invalid ID, permissions issues)

## Troubleshooting

### Common Errors

**"Failed to access spreadsheet"**
- **Cause:** Invalid spreadsheet ID or insufficient permissions
- **Solution:** Verify the spreadsheet ID is correct and the script has authorization to access it. For container-bound scripts without a `spreadsheetId` option, ensure the script is properly attached to a spreadsheet.

**"Failed to flush logs after N attempts"**
- **Cause:** Persistent Google Sheets API errors (quota exceeded, service unavailable, permissions)
- **Solution:** Check Google Apps Script quotas, verify spreadsheet permissions, and ensure the spreadsheet isn't corrupted. Consider increasing retry count: `log.flush(5)`

**"Flush already in progress"** (warning in logs)
- **Cause:** Multiple concurrent flush operations attempted
- **Solution:** This is handled automatically. The duplicate flush is skipped safely. No action required.

**Logs not appearing in sheet**
- **Cause:** Forgot to call `flush()`, or auto-flush threshold not reached
- **Solution:** Always call `flush()` at the end of your script to write any remaining buffered logs

### Best Practices

1. **Always flush at the end:** Call `log.flush()` before your script completes to ensure all logs are written
2. **Handle errors gracefully:** Wrap flush calls in try-catch if you need custom error handling
3. **Appropriate buffer size:** Set `maxBuffer` based on your use case (lower for real-time logging, higher for batch processing)
4. **Consistent log format:** While format switching is handled automatically, consider using only level methods (`info`, `debug`, etc.) for consistent, structured logs

