const GJS_TEXT_DECODER = new TextDecoder('utf-8');
const DATE_FORMATTER_YYYY_MM_DD = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });

function formatDate(dateObj) {
    try {
        let formatted = DATE_FORMATTER_YYYY_MM_DD.format(dateObj);
        if (formatted.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return formatted;
        }
    } catch (e) {
        global.logError(`[Sports-Applet] Intl.DateTimeFormat failed: ${e}`);
    }
    const y = dateObj.getFullYear();
    const m = ("0" + (dateObj.getMonth() + 1)).slice(-2);
    const d = ("0" + dateObj.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
}

function formatTime(dateObj, timeZone) {
    try {
        const opts = { hour: 'numeric', minute: '2-digit' };
        if (timeZone && String(timeZone).trim() !== '') opts.timeZone = String(timeZone).trim();
        return dateObj.toLocaleTimeString(undefined, opts);
    } catch (e) {
        const hh = ("0" + dateObj.getHours()).slice(-2);
        const mm = ("0" + dateObj.getMinutes()).slice(-2);
        return `${hh}:${mm}`;
    }
}

function formatGameTime(dateObj, timeZone) {
    return formatTime(dateObj, timeZone);
}

var EXPORTS = {
    GJS_TEXT_DECODER,
    DATE_FORMATTER_YYYY_MM_DD,
    formatDate,
    formatTime,
    formatGameTime
};
