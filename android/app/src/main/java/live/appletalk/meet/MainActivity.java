package live.appletalk.meet;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Rational;
import android.webkit.WebView;

import androidx.annotation.RequiresApi;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final String ACTION_PIP_CONTROL = "live.appletalk.meet.PIP_CONTROL";
    private static final String EXTRA_CONTROL = "control";

    private BroadcastReceiver pipReceiver;

    @Override
    protected void onStart() {
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
    protected void onDestroy() {
        if (pipReceiver != null) {
            try { unregisterReceiver(pipReceiver); } catch (Exception ignored) {}
            pipReceiver = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        // Only float a PiP window while the user is actually in a meeting.
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        String url = wv != null ? wv.getUrl() : null;
        if (url != null && url.contains("/rooms/")) {
            try {
                enterPictureInPictureMode(buildPipParams());
            } catch (Exception ignored) {}
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.O)
    private PictureInPictureParams buildPipParams() {
        List<RemoteAction> actions = new ArrayList<>();
        actions.add(makeAction("mute", R.drawable.ic_pip_mic, "Mute", 1));
        actions.add(makeAction("end", R.drawable.ic_pip_end, "End", 2));
        actions.add(makeAction("fullscreen", R.drawable.ic_pip_fullscreen, "Open", 3));
        return new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(2, 3))
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

    private void dispatchToWeb(String control) {
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv == null) return;
        final String js = "window.dispatchEvent(new CustomEvent('mytalkpip',{detail:'" + control + "'}))";
        wv.post(() -> wv.evaluateJavascript(js, null));
    }
}
