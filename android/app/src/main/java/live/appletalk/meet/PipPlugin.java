package live.appletalk.meet;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge the web app ↔ native Picture-in-Picture:
 *  - setMuted: web reports the current mic state so the PiP Mute/Unmute action
 *    button shows the correct icon + label.
 *  - enterPip: web asks to enter PiP (e.g. on the Android back button).
 */
@CapacitorPlugin(name = "Pip")
public class PipPlugin extends Plugin {

    @PluginMethod
    public void setMuted(PluginCall call) {
        final boolean muted = Boolean.TRUE.equals(call.getBoolean("muted", false));
        final Activity a = getActivity();
        if (a instanceof MainActivity) {
            a.runOnUiThread(() -> ((MainActivity) a).updateMuted(muted));
        }
        call.resolve();
    }

    @PluginMethod
    public void enterPip(PluginCall call) {
        final Activity a = getActivity();
        if (a instanceof MainActivity) {
            a.runOnUiThread(() -> ((MainActivity) a).enterPipFromWeb());
        }
        call.resolve();
    }
}
