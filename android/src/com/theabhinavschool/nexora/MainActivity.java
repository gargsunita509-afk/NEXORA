package com.theabhinavschool.nexora;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.JsPromptResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {

    // Primary standalone offline entry point packaged inside APK
    public static final String LOCAL_ENTRY_URL = "file:///android_asset/www/index.html";
    // Public production server pointer (used for online update checks, live features, and API sync)
    public static final String PRODUCTION_URL = "https://ais-pre-cjjqxynp5pw6257ks3igyi-205056013380.asia-southeast1.run.app";
    public static final String APP_VERSION = "1.8.0";
    public static final int VERSION_CODE = 8;

    private WebView mWebView;
    private ProgressBar mProgressBar;
    private boolean mHasFallenBack = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Borderless immersive fullscreen for Smart Board & Android phones/tablets
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_main);

        mWebView = (WebView) findViewById(R.id.webview);
        mProgressBar = (ProgressBar) findViewById(R.id.progressBar);

        initWebView();

        // Standalone offline-first entry point: load bundled web assets directly.
        // The app opens instantly without network latency or 404/ERR_NAME_NOT_RESOLVED failures.
        // Online features and shared data sync are coordinated seamlessly via apkApiBridge over HTTPS.
        try {
            mWebView.loadUrl(LOCAL_ENTRY_URL);
        } catch (Exception e) {
            renderRetryScreen("Startup Error", "Unable to load local NEXORA package: " + e.getMessage());
        }
    }

    private void renderRetryScreen(String title, String message) {
        String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
            + "<style>body{background:#040814;color:#00f0ff;font-family:sans-serif;display:flex;flex-direction:column;"
            + "align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px;box-sizing:border-box;}"
            + "h1{font-size:24px;margin-bottom:8px;color:#ffffff;letter-spacing:2px;font-weight:bold;}"
            + "p{color:#94a3b8;font-size:13px;max-width:320px;line-height:1.6;margin-bottom:24px;}"
            + ".btn{background:rgba(0,240,255,0.15);border:1px solid #00f0ff;color:#00f0ff;padding:12px 24px;"
            + "border-radius:12px;font-weight:bold;cursor:pointer;margin:6px;font-size:13px;display:inline-block;}"
            + ".btn-primary{background:#00f0ff;color:#040814;border:none;}</style></head><body>"
            + "<h1>NEXORA</h1><p>" + message + "</p><div>"
            + "<button class='btn btn-primary' onclick=\"window.location.href='file:///android_asset/www/index.html'\">Launch Bundled App</button>"
            + "<button class='btn' onclick=\"window.location.reload()\">Retry Connection</button>"
            + "</div></body></html>";
        if (mWebView != null) {
            mWebView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        }
    }

    private void openExternalDownload(String url) {
        try {
            if (url == null || url.isEmpty()) return;
            String resolvedUrl = url;
            if (url.startsWith("/")) {
                resolvedUrl = PRODUCTION_URL + url;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(resolvedUrl));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    private void initWebView() {
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Identify this as the official NEXORA Android APK runtime
        String defaultUA = settings.getUserAgentString();
        settings.setUserAgentString(defaultUA + " NEXORA_Android_App/" + APP_VERSION + " (VersionCode/" + VERSION_CODE + ")");

        // Delegate APK and attachment downloads to Android system downloader / native PDF saver
        mWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                if (url == null) return;
                if (url.startsWith("data:application/pdf;base64,")) {
                    String b64 = url.substring("data:application/pdf;base64,".length());
                    savePdfToDownloads("NEXORA_Document.pdf", b64);
                    return;
                }
                if (!url.startsWith("blob:")) {
                    openExternalDownload(url);
                }
            }
        });

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Prevent redirection to Google AI Studio login or dev containers
                if (url != null && (url.contains("accounts.google.com") || url.contains("ais-dev-") || url.contains("__cookie_check"))) {
                    view.loadUrl(LOCAL_ENTRY_URL);
                    return true;
                }
                // Hand off APK downloads to Android system browser / package installer
                if (url != null && (url.endsWith(".apk") || url.contains("/downloads/nexora-"))) {
                    openExternalDownload(url);
                    return true;
                }
                if (url != null) {
                    view.loadUrl(url);
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (mProgressBar != null) {
                    mProgressBar.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (mProgressBar != null) {
                    mProgressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // If any network error occurs when trying to access remote server, fall back immediately to local package
                if (!mHasFallenBack && (failingUrl == null || !failingUrl.startsWith("file:///android_asset/"))) {
                    mHasFallenBack = true;
                    view.loadUrl(LOCAL_ENTRY_URL);
                    return;
                }
                renderRetryScreen("Offline / Connection Error", "Unable to load page: " + description);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                // Catch any HTTP 404 or 500 error from external server and fall back to local package
                if (request != null && request.isForMainFrame()) {
                    int statusCode = errorResponse != null ? errorResponse.getStatusCode() : 0;
                    if (statusCode >= 400) {
                        if (!mHasFallenBack) {
                            mHasFallenBack = true;
                            view.post(new Runnable() {
                                @Override
                                public void run() {
                                    view.loadUrl(LOCAL_ENTRY_URL);
                                }
                            });
                            return;
                        } else {
                            renderRetryScreen("Server Notice (" + statusCode + ")", "The remote server returned HTTP " + statusCode + ". Launch local app or retry.");
                            return;
                        }
                    }
                }
                super.onReceivedHttpError(view, request, errorResponse);
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 100 && mProgressBar != null) {
                    mProgressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
                if (message != null && message.startsWith("NEXORA_SAVE_PDF:")) {
                    String filename = message.substring("NEXORA_SAVE_PDF:".length());
                    String status = savePdfToDownloads(filename, defaultValue);
                    result.confirm(status);
                    return true;
                }
                if (message != null && message.startsWith("NEXORA_OPEN_PDF:")) {
                    String status = openSavedPdf(defaultValue);
                    result.confirm(status);
                    return true;
                }
                return super.onJsPrompt(view, url, message, defaultValue, result);
            }
        });
    }

    public String savePdfToDownloads(String rawFilename, String base64Data) {
        try {
            if (base64Data == null) return "ERR:Missing PDF data";
            String filename = (rawFilename == null || rawFilename.isEmpty()) ? "NEXORA_Document.pdf" : rawFilename;
            if (!filename.endsWith(".pdf")) filename = filename + ".pdf";
            String cleanB64 = base64Data;
            int commaIdx = cleanB64.indexOf(',');
            if (commaIdx >= 0) {
                cleanB64 = cleanB64.substring(commaIdx + 1);
            }
            byte[] pdfBytes = Base64.decode(cleanB64, Base64.DEFAULT);
            if (pdfBytes == null || pdfBytes.length < 100) {
                return "ERR:Invalid or empty PDF payload";
            }
            if (pdfBytes[0] != 0x25 || pdfBytes[1] != 0x50 || pdfBytes[2] != 0x44 || pdfBytes[3] != 0x46) {
                return "ERR:Invalid PDF header signature";
            }

            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver resolver = getContentResolver();
                ContentValues values = new ContentValues();
                values.put("_display_name", filename);
                values.put("mime_type", "application/pdf");
                values.put("relative_path", "Download");
                values.put("is_pending", Integer.valueOf(1));
                Uri collection = Uri.parse("content://media/external/downloads");
                Uri itemUri = resolver.insert(collection, values);
                if (itemUri != null) {
                    OutputStream os = resolver.openOutputStream(itemUri);
                    if (os != null) {
                        os.write(pdfBytes);
                        os.flush();
                        os.close();
                        ContentValues updateValues = new ContentValues();
                        updateValues.put("is_pending", Integer.valueOf(0));
                        resolver.update(itemUri, updateValues, null, null);
                        Cursor cursor = resolver.query(itemUri, null, null, null, null);
                        if (cursor != null) {
                            boolean exists = cursor.moveToFirst();
                            cursor.close();
                            if (exists) {
                                Toast.makeText(this, "PDF saved to Downloads", Toast.LENGTH_LONG).show();
                                return "OK|" + itemUri.toString() + "|" + pdfBytes.length + "|MediaStore|Downloads/" + filename;
                            }
                        }
                    }
                }
            }

            File dlDir = Environment.getExternalStoragePublicDirectory("Download");
            if (!dlDir.exists()) dlDir.mkdirs();
            File outFile = new File(dlDir, filename);
            if (outFile.exists()) {
                outFile = new File(dlDir, System.currentTimeMillis() + "_" + filename);
            }
            FileOutputStream fos = new FileOutputStream(outFile);
            fos.write(pdfBytes);
            fos.flush();
            fos.close();
            if (outFile.exists() && outFile.length() >= 100L) {
                Toast.makeText(this, "PDF saved to Downloads", Toast.LENGTH_LONG).show();
                return "OK|" + Uri.fromFile(outFile).toString() + "|" + pdfBytes.length + "|LegacyDownload|Downloads/" + outFile.getName();
            }
            return "ERR:File verification failed";
        } catch (Exception e) {
            return "ERR:" + e.getMessage();
        }
    }

    public String openSavedPdf(String uriStr) {
        try {
            if (uriStr != null && uriStr.startsWith("content://")) {
                Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                viewIntent.setDataAndType(Uri.parse(uriStr), "application/pdf");
                viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(viewIntent);
                return "OK";
            }
        } catch (Exception ignored) {
        }
        try {
            Intent dlIntent = new Intent("android.intent.action.VIEW_DOWNLOADS");
            dlIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(dlIntent);
            return "OK";
        } catch (Exception e) {
            return "ERR:" + e.getMessage();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        if (mWebView != null) {
            mWebView.destroy();
        }
        super.onDestroy();
    }
}
