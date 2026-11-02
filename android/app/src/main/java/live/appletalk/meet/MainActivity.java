package live.appletalk.meet;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.WebView;

import androidx.annotation.RequiresApi;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final String ACTION_PIP_CONTROL = "live.appletalk.meet.PIP_CONTROL";
    private static final String EXTRA_CONTROL = "control";

    private BroadcastReceiver pipReceiver;
    private boolean micMuted = false;
    private boolean inPip = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the web ↔ native PiP bridge before Capacitor loads the page.
        registerPlugin(PipPlugin.class);
        super.onCreate(savedInstanceState);

        // Subscribe this device to the meeting-call broadcast topic.
        FirebaseMessaging.getInstance().subscribeToTopic("meetings");

        // Android 13+ needs an explicit notification permission for the calls.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
        }

        handleCallIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallIntent(intent);
    }

    /** When the user answers an incoming-call notification, open the meeting. */
    private void handleCallIntent(Intent intent) {
        if (intent == null) return;
        final String callUrl = intent.getStringExtra("callUrl");
        if (callUrl == null || callUrl.isEmpty()) return;
        // Clear the ringing notification.
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(MyFirebaseMessagingService.CALL_NOTIFICATION_ID);
        // Navigate the WebView to the meeting (auto-join). Post so the bridge/WebView
        // is ready; a short delay lets Capacitor finish loading the start URL first.
        final WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) {
            wv.postDelayed(() -> wv.loadUrl(callUrl), 300);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (pipReceiver == null) {
            pipReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String control = intent.getStringExtra(EXTRA_CONTROL);
                    if (control == null) return;
                    if (control.equals("fullscreen")) {
                        // Bring the activity back to the foreground (exit PiP).
                        Intent i = new Intent(MainActivity.this, MainActivity.class)
                                .setFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        startActivity(i);
                    } else {
                        // "mute" / "end" → hand off to the web app (LiveKit room).
                        dispatchToWeb(control);
                    }
                }
            };
            IntentFilter filter = new IntentFilter(ACTION_PIP_CONTROL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(pipReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(pipReceiver, filter);
            }
        }
    }

    @Override
    public void onDestroy() {
        if (pipReceiver != null) {
            try { unregisterReceiver(pipReceiver); } catch (Exception ignored) {}
            pipReceiver = null;
        }
        super.onDestroy();
    }

    /** Auto-enter PiP when the user leaves the app (home button) during a meeting. */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (isInMeeting()) enterPip();
    }

    /** Called by the web layer (Android back button) to float the meeting into PiP. */
    public void enterPipFromWeb() {
        if (isInMeeting()) enterPip();
    }

    /** Web reports the current mic state; refresh the Mute/Unmute action when in PiP. */
    public void updateMuted(boolean muted) {
        micMuted = muted;
        if (inPip && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { setPictureInPictureParams(buildPipParams()); } catch (Exception ignored) {}
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        inPip = isInPictureInPictureMode;
        // Tell the web app to switch to / out of the clean PiP grid layout.
        dispatchToWeb(isInPictureInPictureMode ? "pip-enter" : "pip-exit");
    }

    private boolean isInMeeting() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        String url = wv != null ? wv.getUrl() : null;
        return url != null && url.contains("/rooms/");
    }

    private void enterPip() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            enterPictureInPictureMode(buildPipParams());
        } catch (Exception ignored) {}
    }

    @RequiresApi(api = Build.VERSION_CODES.O)
    private PictureInPictureParams buildPipParams() {
        List<RemoteAction> actions = new ArrayList<>();
        if (micMuted) {
            actions.add(makeAction("mute", R.drawable.ic_pip_mic_off, "Unmute", 1));
        } else {
            actions.add(makeAction("mute", R.drawable.ic_pip_mic, "Mute", 1));
        }
        actions.add(makeAction("end", R.drawable.ic_pip_end, "End", 2));
        actions.add(makeAction("fullscreen", R.drawable.ic_pip_fullscreen, "Open", 3));
        return new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(3, 4))
                .setActions(actions)
                .build();
    }

    @RequiresApi(api = Build.VERSION_CODES.O)
    private RemoteAction makeAction(String control, int iconRes, String title, int requestCode) {
        Intent intent = new Intent(ACTION_PIP_CONTROL)
                .putExtra(EXTRA_CONTROL, control)
                .setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(this, requestCode, intent, flags);
        Icon icon = Icon.createWithResource(this, iconRes);
        return new RemoteAction(icon, title, title, pi);
    }

    private void dispatchToWeb(String message) {
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv == null) return;
        final String js = "window.dispatchEvent(new CustomEvent('mytalkpip',{detail:'" + message + "'}))";
        wv.post(() -> wv.evaluateJavascript(js, null));
    }
}
