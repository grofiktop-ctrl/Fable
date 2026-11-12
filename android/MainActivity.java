package com.grofik.dnevnik;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

// Оболочка APK «Дневник». Сборка: android/build-apk.sh
public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int MEDIA_PERMISSION_REQUEST_CODE = 1002;
    private ValueCallback<Uri[]> uploadMessage;
    private ValueCallback<Uri> uploadMessageOld;
    private PermissionRequest pendingWebPermission;
    private WebView webView;

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        requestWindowFeature(1);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (uploadMessage != null) uploadMessage.onReceiveValue(null);
                uploadMessage = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                if (params != null && params.getAcceptTypes() != null && params.getAcceptTypes().length > 0) {
                    String type = params.getAcceptTypes()[0];
                    if (type != null && !type.trim().isEmpty() && !type.equals("*/*")) intent.setType(type);
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(intent, "Прикрепить фото или файл"), FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (Exception e) {
                    try {
                        startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                        return true;
                    } catch (Exception e2) {
                        if (uploadMessage != null) uploadMessage.onReceiveValue(null);
                        uploadMessage = null;
                        Toast.makeText(MainActivity.this, "Не удалось открыть выбор файлов: " + e2.getMessage(), Toast.LENGTH_SHORT).show();
                        return false;
                    }
                }
            }

            public void openFileChooser(ValueCallback<Uri> callback, String type, String capture) {
                uploadMessageOld = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(type == null || type.isEmpty() ? "image/*" : type);
                startActivityForResult(Intent.createChooser(intent, "Прикрепить фото"), FILE_CHOOSER_REQUEST_CODE);
            }

            public void openFileChooser(ValueCallback<Uri> callback, String type) { openFileChooser(callback, type, ""); }

            public void openFileChooser(ValueCallback<Uri> callback) { openFileChooser(callback, "image/*", ""); }

            // WebView разрешает микрофон только если у приложения есть разрешение Android,
            // иначе getUserMedia зависает — поэтому сначала спрашиваем систему.
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                List<String> missing = new ArrayList<>();
                for (String resource : request.getResources()) {
                    String perm = androidPermissionFor(resource);
                    if (perm != null && checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED && !missing.contains(perm)) missing.add(perm);
                }
                if (missing.isEmpty()) {
                    request.grant(request.getResources());
                    return;
                }
                if (pendingWebPermission != null) pendingWebPermission.deny();
                pendingWebPermission = request;
                requestPermissions(missing.toArray(new String[0]), MEDIA_PERMISSION_REQUEST_CODE);
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) pendingWebPermission = null;
            }
        });
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private static String androidPermissionFor(String resource) {
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return Manifest.permission.RECORD_AUDIO;
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return Manifest.permission.CAMERA;
        return null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != MEDIA_PERMISSION_REQUEST_CODE) {
            super.onRequestPermissionsResult(requestCode, permissions, results);
            return;
        }
        PermissionRequest request = pendingWebPermission;
        pendingWebPermission = null;
        if (request == null) return;
        List<String> granted = new ArrayList<>();
        for (String resource : request.getResources()) {
            String perm = androidPermissionFor(resource);
            if (perm == null || checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) granted.add(resource);
        }
        if (granted.isEmpty()) request.deny();
        else request.grant(granted.toArray(new String[0]));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        if (requestCode != FILE_CHOOSER_REQUEST_CODE) {
            super.onActivityResult(requestCode, resultCode, intent);
            return;
        }
        if (uploadMessage != null) {
            Uri[] uris = null;
            if (resultCode == RESULT_OK && intent != null) {
                ClipData clip = intent.getClipData();
                if (clip != null) {
                    uris = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) uris[i] = clip.getItemAt(i).getUri();
                } else if (intent.getData() != null) {
                    uris = new Uri[]{intent.getData()};
                }
            }
            uploadMessage.onReceiveValue(uris);
            uploadMessage = null;
        }
        if (uploadMessageOld != null) {
            uploadMessageOld.onReceiveValue(intent == null || resultCode != RESULT_OK ? null : intent.getData());
            uploadMessageOld = null;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
