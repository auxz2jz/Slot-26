package com.zaksecurity.relayone;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.telephony.TelephonyManager;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.CookieManager;
import android.net.TrafficStats;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;
import java.util.Objects;

public final class MainActivity extends Activity {
    private static final String HOME = "https://auxz2jz.github.io/Slot-26/";
    private static final String TRUSTED_HOST = "auxz2jz.github.io";
    private static final int REQUEST_MIC = 2101;
    private static final int REQUEST_PHONE = 2102;
    private static final int MAX_LOG = 300;
    private static final int MAX_REPORT = 1_800_000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayDeque<String> history = new ArrayDeque<>();
    private WebView browser;
    private PermissionRequest microphoneRequest;
    private boolean pageFinished = false;
    private SharedPreferences prefs;
    private String lastNetwork = "";
    private long startRx;
    private long startTx;
    private long startedAt;
    private long lastExportAt;
    private boolean running = true;

    private final Runnable watch = new Runnable() {
        @Override public void run() {
            if (!running) return;
            String current = networkSummary();
            if (!current.equals(lastNetwork)) {
                lastNetwork = current;
                note("NETWORK CHANGE", current);
            }
            if ((System.currentTimeMillis() - startedAt) / 1000 % 30 < 5) {
                note("NETWORK SAMPLE", current + "; " + trafficSummary());
            }
            handler.postDelayed(this, 5000);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(8,24,36));
        getWindow().setNavigationBarColor(Color.rgb(8,24,36));
        startedAt = System.currentTimeMillis();
        startRx = TrafficStats.getUidRxBytes(Process.myUid());
        startTx = TrafficStats.getUidTxBytes(Process.myUid());
        prefs = getSharedPreferences("relay_diagnostics", MODE_PRIVATE);
        restoreHistory();
        note("ANDROID APP LAUNCHED", "Version 0.1.0; OS API " + Build.VERSION.SDK_INT);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(8,24,36));
        // API 35 enforces edge-to-edge; keep the radio underneath neither status nor navigation bars.
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
        browser = new WebView(this);
        browser.setBackgroundColor(Color.rgb(8,24,36));
        browser.setKeepScreenOn(true); // PTT, WebRTC and timers need a foreground page.
        WebSettings s = browser.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        browser.addJavascriptInterface(new RelayBridge(), "RelayAndroid");
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if (isAllowed(target)) return false;
                if (request.isForMainFrame() && "https".equalsIgnoreCase(target.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, target)); }
                    catch (ActivityNotFoundException ignored) { note("EXTERNAL LINK FAILED", "No browser available"); }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (isAllowed(Uri.parse(url))) {
                    pageFinished = true;
                    note("RADIO PAGE LOADED", "Trusted HTTPS page; JS diagnostics active");
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
                if (req.isForMainFrame()) {
                    note("PAGE LOAD ERROR", "WebView error code " + error.getErrorCode());
                    toast("Radio page could not load. Check your internet connection.");
                }
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                if (!isAllowedOrigin(request.getOrigin())
                        || request.getResources().length != 1
                        || !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(request.getResources()[0])) {
                    request.deny();
                    note("MEDIA PERMISSION BLOCKED", "Untrusted or unsupported resource");
                    return;
                }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    note("MICROPHONE GRANTED", "Trusted radio page");
                } else {
                    microphoneRequest = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
                }
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (microphoneRequest == request) microphoneRequest = null;
            }
        });
        browser.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            if (!url.startsWith("https://" + TRUSTED_HOST + "/Slot-26/")) {
                note("DOWNLOAD BLOCKED", "Use Global Diagnostics Save for text reports");
                return;
            }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Relay-One-download");
            ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
        });
        root.addView(browser, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        browser.loadUrl(HOME);
        lastNetwork = networkSummary();
        note("NETWORK BASELINE", lastNetwork);
        handler.postDelayed(watch, 5000);
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED
                && !prefs.getBoolean("phone_permission_asked", false)) {
            prefs.edit().putBoolean("phone_permission_asked", true).apply();
            requestPermissions(new String[]{Manifest.permission.READ_PHONE_STATE}, REQUEST_PHONE);
        }
    }

    private boolean isAllowedOrigin(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && TRUSTED_HOST.equalsIgnoreCase(uri.getHost());
    }
    private boolean isAllowed(Uri uri) {
        return isAllowedOrigin(uri) && uri.getPath() != null
                && (uri.getPath().equals("/Slot-26") || uri.getPath().startsWith("/Slot-26/"));
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQUEST_MIC) {
            PermissionRequest pr = microphoneRequest;
            microphoneRequest = null;
            if (pr != null) {
                if (granted && browser != null && isAllowed(Uri.parse(browser.getUrl()))) {
                    pr.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else pr.deny();
            }
            note("MICROPHONE PERMISSION", granted ? "Allowed" : "Denied");
        } else if (requestCode == REQUEST_PHONE) {
            note("PHONE STATE PERMISSION", granted ? "Allowed (optional diagnostics)" : "Denied; radio still available");
        }
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        // Physical headset hook / some programmable buttons only. No volume hijacking.
        int k = event.getKeyCode();
        if (k == KeyEvent.KEYCODE_HEADSETHOOK || k == KeyEvent.KEYCODE_BUTTON_1) {
            if (browser != null && event.getRepeatCount() == 0) {
                String kind = event.getAction() == KeyEvent.ACTION_DOWN ? "keydown" :
                              event.getAction() == KeyEvent.ACTION_UP ? "keyup" : "";
                if (!kind.isEmpty()) {
                    browser.evaluateJavascript(
                        "window.dispatchEvent(new KeyboardEvent('" + kind
                        + "',{key:'RelayNativePTT',code:'RelayNativePTT',bubbles:true}));", null);
                    note("PHYSICAL PTT KEY", kind);
                }
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override public void onBackPressed() {
        if (browser != null && browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }

    @Override public void onPause() {
        if (browser != null) browser.onPause();
        note("ANDROID APP BACKGROUND", "WebView audio/timers may pause while backgrounded");
        persistHistory();
        super.onPause();
    }
    @Override public void onResume() {
        super.onResume();
        if (browser != null) browser.onResume();
        if (prefs != null) note("ANDROID APP FOREGROUND", "Returning to radio");
    }
    @Override public void onDestroy() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        if (browser != null) {
            browser.removeJavascriptInterface("RelayAndroid");
            browser.stopLoading();
            browser.destroy();
            browser = null;
        }
        persistHistory();
        super.onDestroy();
    }

    private String networkSummary() {
        try {
            ConnectivityManager cm = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
            NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
            if (nc == null) return "transport=none; internetValidated=false; network unavailable";
            String transport = nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "cellular"
                    : nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "Wi-Fi"
                    : nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "ethernet"
                    : nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ? "VPN" : "other";
            return "transport=" + transport +
                "; internetValidated=" + nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) +
                "; captivePortal=" + nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL) +
                "; metered=" + cm.isActiveNetworkMetered();
        } catch (Exception ignored) { return "network capabilities unavailable"; }
    }

    private String telephonySummary() {
        try {
            TelephonyManager tm = (TelephonyManager)getSystemService(TELEPHONY_SERVICE);
            if (tm == null) return "telephony=not supported";
            String operator = safe(tm.getSimOperatorName(), 60);
            boolean allowed = Build.VERSION.SDK_INT < 23 ||
                    checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED;
            String radio = "permission not granted";
            String signal = "unavailable";
            if (allowed) {
                int type = tm.getDataNetworkType();
                radio = type == TelephonyManager.NETWORK_TYPE_LTE ? "LTE (may include 5G NSA)"
                     : Build.VERSION.SDK_INT >= 29 && type == TelephonyManager.NETWORK_TYPE_NR ? "5G NR"
                     : type == TelephonyManager.NETWORK_TYPE_HSPAP ? "HSPA+"
                     : type == TelephonyManager.NETWORK_TYPE_UMTS ? "UMTS"
                     : type == TelephonyManager.NETWORK_TYPE_EDGE ? "EDGE"
                     : type == TelephonyManager.NETWORK_TYPE_GPRS ? "GPRS"
                     : type == TelephonyManager.NETWORK_TYPE_UNKNOWN ? "unknown" : "other (" + type + ")";
                if (Build.VERSION.SDK_INT >= 29) {
                    try {
                        android.telephony.SignalStrength strength = tm.getSignalStrength();
                        if (strength != null) {
                            for (android.telephony.CellSignalStrength cell : strength.getCellSignalStrengths()) {
                                int dbm = cell.getDbm();
                                if (dbm >= -160 && dbm <= -20) {
                                    signal = dbm + " dBm (" + cell.getClass().getSimpleName() + ")";
                                    break;
                                }
                            }
                        }
                    } catch (SecurityException ignored) { signal = "restricted by Android"; }
                }
            }
            return "SIM carrier=" + (operator.isEmpty() ? "not exposed" : operator)
                    + "; data radio=" + radio + "; signal=" + signal;
        } catch (Exception ignored) {
            return "telephony details unavailable (permission or device restriction)";
        }
    }
    private String trafficSummary() {
        long rx = TrafficStats.getUidRxBytes(Process.myUid());
        long tx = TrafficStats.getUidTxBytes(Process.myUid());
        if (rx < 0 || tx < 0 || startRx < 0 || startTx < 0) {
            return "app UID traffic unsupported";
        }
        return "app UID traffic since launch: received=" + Math.max(0, rx - startRx)
            + " B; sent=" + Math.max(0, tx - startTx)
            + " B (all transports, NOT plan balance)";
    }
    private String safe(String value, int size) {
        if (value == null) return "";
        String cleaned = value.replaceAll("[^A-Za-z0-9 ._()+-]", "");
        return cleaned.substring(0, Math.min(size, cleaned.length()));
    }
    private String now() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).format(new Date());
    }
    private synchronized void note(String event, String details) {
        history.addLast(now() + " | " + event + " | " + details);
        while (history.size() > MAX_LOG) history.removeFirst();
    }
    private synchronized void restoreHistory() {
        String old = prefs.getString("previous_native_events", "");
        if (!old.isEmpty()) {
            for (String line : old.split("\n")) {
                if (!line.isEmpty()) history.addLast(line);
                while (history.size() > MAX_LOG) history.removeFirst();
            }
        }
    }
    private synchronized void persistHistory() {
        prefs.edit().putString("previous_native_events",
                TextUtils.join("\n", history)).apply();
    }
    private synchronized String nativeReport() {
        StringBuilder b = new StringBuilder();
        b.append("Native app: Relay One 0.1.0; Android API ").append(Build.VERSION.SDK_INT)
         .append("; manufacturer=").append(safe(Build.MANUFACTURER, 50))
         .append("; model=").append(safe(Build.MODEL, 60)).append('\n')
         .append("Current network: ").append(networkSummary()).append('\n')
         .append("Current telephony: ").append(telephonySummary()).append('\n')
         .append("Current app data: ").append(trafficSummary()).append('\n')
         .append("Data plan allowance, plan expiry, account balance: not available to apps without carrier integration\n")
         .append("Foreground WebView: ").append(pageFinished)
         .append("; microphone Android permission=")
         .append(checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
         .append('\n').append("Recent native events (bounded; previous app launch may appear):\n");
        for (String entry : history) b.append(entry).append('\n');
        return b.toString();
    }
    private void toast(String value) {
        handler.post(() -> Toast.makeText(this, value, Toast.LENGTH_LONG).show());
    }
    private void saveReport(String text) {
        if (text.length() > MAX_REPORT) {
            note("REPORT TOO LARGE", "Export truncated");
            text = text.substring(0, MAX_REPORT);
        }
        try {
            String name = "Relay-One-Android-diagnostics-"
                + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date()) + ".txt";
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, "text/plain");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Relay-One");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("No Download URI");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("No output stream");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(uri, values, null, null);
                note("DIAGNOSTIC EXPORTED", "Downloads/Relay-One/" + name + "; bytes=" + bytes.length);
                toast("Saved to Downloads / Relay-One / " + name);
            } else {
                File folder = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (folder == null) throw new IllegalStateException("No external app storage");
                File destination = new File(folder, name);
                try (OutputStream out = new FileOutputStream(destination)) {
                    out.write(bytes);
                }
                note("DIAGNOSTIC EXPORTED", "App Downloads folder; bytes=" + bytes.length);
                toast("Saved to Relay One app's Downloads folder");
            }
        } catch (Exception e) {
            note("DIAGNOSTIC EXPORT ERROR", e.getClass().getSimpleName());
            toast("Unable to save report; use Copy global diagnostics instead");
        }
    }
    public final class RelayBridge {
        @JavascriptInterface public String getDiagnostics() {
            return nativeReport();
        }
        @JavascriptInterface public void saveDiagnostics(String report) {
            if (report == null) return;
            // JavascriptInterface runs off the UI thread.
            if (!isAllowed(browser == null ? null : Uri.parse(browser.getUrl()))) return;
            if (System.currentTimeMillis() - lastExportAt < 1500) return;
            lastExportAt = System.currentTimeMillis();
            handler.post(() -> saveReport(report));
        }
    }
}
