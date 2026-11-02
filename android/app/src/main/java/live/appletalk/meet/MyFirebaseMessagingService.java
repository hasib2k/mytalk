package live.appletalk.meet;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives the data-only FCM "incoming_call" message and renders a full
 * CallStyle incoming-call notification (ringtone + vibrate + Answer/Decline),
 * with a full-screen intent so it shows over the lock screen.
 */
public class MyFirebaseMessagingService extends FirebaseMessagingService {

    static final String CHANNEL_ID = "incoming_calls";
    static final int CALL_NOTIFICATION_ID = 7001;

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        // Keep the device subscribed to the broadcast topic.
        FirebaseMessaging.getInstance().subscribeToTopic("meetings");
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String roomName = data.get("roomName");
        if (roomName == null || roomName.isEmpty()) return;
        String title = data.get("title");
        String url = data.get("url");
        if (url == null || url.isEmpty()) {
            url = "https://meet.appletalk.live/rooms/" + roomName + "?autojoin=1";
        }
        showIncomingCall(title == null ? "" : title, url);
    }

    private void showIncomingCall(String title, String url) {
        createChannel();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Answer → open the app at the meeting (auto-join).
        Intent answerIntent = new Intent(this, MainActivity.class)
                .setAction("live.appletalk.meet.ANSWER_CALL")
                .putExtra("callUrl", url)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent answerPending = PendingIntent.getActivity(this, 1, answerIntent, piFlags());

        // Decline → dismiss the ringing notification.
        Intent declineIntent = new Intent(this, CallActionReceiver.class).setAction("DECLINE");
        PendingIntent declinePending = PendingIntent.getBroadcast(this, 2, declineIntent, piFlags());

        Person caller = new Person.Builder()
                .setName(title != null && !title.isEmpty() ? title : "MyTalk meeting")
                .build();

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title != null && !title.isEmpty() ? title : "MyTalk meeting")
                .setContentText("Incoming meeting — tap Answer to join")
                .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePending, answerPending))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(true)
                .setFullScreenIntent(answerPending, true);

        nm.notify(CALL_NOTIFICATION_ID, b.build());
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Incoming meeting calls", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Rings when a meeting is starting");
        Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        ch.setSound(ring, attrs);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 1000, 1000, 1000});
        ch.setBypassDnd(true);
        nm.createNotificationChannel(ch);
    }

    private int piFlags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }
}
