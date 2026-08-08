package com.ccms.gaminglounge;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Disable Android system font-scaling in the WebView.
        // Without this, users with large font accessibility settings will get
        // compounded text-zoom on top of the web app's own responsive CSS.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}

