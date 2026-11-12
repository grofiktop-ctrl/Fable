package com.grofik.dnevnik;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.Window;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int MICROPHONE_REQUEST_CODE = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> uploadMessage;
    private PermissionRequest pendingMicRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
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
        // Звук вызова и голос собеседника должны играть без предварительного нажатия.
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                boolean wantsAudio = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsAudio = true;
                }
                if (!wantsAudio) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    grantMicrophone(request);
                    return;
                }
                // WebView не может дать микрофон, пока его не разрешила сама система Android.
                if (pendingMicRequest != null) pendingMicRequest.deny();
                pendingMicRequest = request;
                requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, MICROPHONE_REQUEST_CODE);
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (request == pendingMicRequest) pendingMicRequest = null;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                if (params != null && params.getAcceptTypes() != null && params.getAcceptTypes().length > 0) {
                    String type = params.getAcceptTypes()[0];
                    if (type != null && !type.trim().isEmpty() && !type.equals("*/*")) intent.setType(type);
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                }
                Intent chooser = Intent.createChooser(intent, "Прикрепить фото или файл");
                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (Exception first) {
                    try {
                        startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                        return true;
                    } catch (Exception second) {
                        if (uploadMessage != null) {
                            uploadMessage.onReceiveValue(null);
                            uploadMessage = null;
                        }
                        Toast.makeText(MainActivity.this, "Не удалось открыть выбор файлов: " + second.getMessage(), Toast.LENGTH_SHORT).show();
                        return false;
                    }
                }
            }
        });
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void grantMicrophone(PermissionRequest request) {
        try {
            request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
        } catch (Exception ignored) {
            // Запрос мог устареть, пока пользователь отвечал системному окну.
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != MICROPHONE_REQUEST_CODE) {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
            return;
        }
        PermissionRequest request = pendingMicRequest;
        pendingMicRequest = null;
        if (request == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) grantMicrophone(request);
        else request.deny();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != FILE_CHOOSER_REQUEST_CODE) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (uploadMessage == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                results = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) results[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                results = new Uri[] { data.getData() };
            }
        }
        uploadMessage.onReceiveValue(results);
        uploadMessage = null;
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
