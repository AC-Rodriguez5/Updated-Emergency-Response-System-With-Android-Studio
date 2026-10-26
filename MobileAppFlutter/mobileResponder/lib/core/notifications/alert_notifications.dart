import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// What the phone does when an incident lands.
///
/// Until now a new emergency changed a pin on a map the responder had to be
/// looking at. Nothing rang, nothing buzzed, and nothing at all happened if the
/// app was in their pocket — which is where a phone is for most of a shift. The
/// socket was delivering; there was simply nowhere for the delivery to go.
///
/// Two channels, because they are two different promises:
///
/// * [alertChannelId] is the alarm. Max importance, alarm audio stream,
///   full-screen intent, long vibration — it has to wake a phone face-down on a
///   table in a noisy station.
/// * [dutyChannelId] is the quiet, permanent "On duty" row. It carries no sound
///   and cannot be swiped away, because it is the foreground service that keeps
///   the alarm channel reachable at all.
class AlertNotifications {
  AlertNotifications._();

  static const String alertChannelId = 'tanzalert_incident_alerts';
  static const String dutyChannelId = 'tanzalert_duty_session';

  /// Fixed id so the foreground service keeps replacing one row rather than
  /// stacking a new one every heartbeat.
  static const int dutyNotificationId = 912_001;

  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  static bool _ready = false;

  /// Routes a tap. Set by the UI isolate; the service isolate leaves it null and
  /// lets Android's default launch behaviour open the app.
  static void Function(String? payload)? onTap;

  /// Safe to call in either isolate, and more than once.
  static Future<void> init() async {
    if (_ready) return;
    _ready = true;

    await _plugin.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
      onDidReceiveNotificationResponse: (response) =>
          onTap?.call(response.payload),
    );

    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    if (android == null) return;

    await android.createNotificationChannel(
      AndroidNotificationChannel(
        alertChannelId,
        'Emergency alerts',
        description:
            'Panic-button presses and new incidents. Keep this on — it is how '
            'dispatch reaches you.',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
        vibrationPattern: _alarmVibration,
        enableLights: true,
        // The alarm stream, not the notification stream: a responder who has
        // silenced notifications for the evening still has to hear this.
        audioAttributesUsage: AudioAttributesUsage.alarm,
      ),
    );
    await android.createNotificationChannel(
      const AndroidNotificationChannel(
        dutyChannelId,
        'Duty session',
        description:
            'Shows while you are on duty. Keeps the app listening for alerts.',
        importance: Importance.low,
        playSound: false,
        enableVibration: false,
        showBadge: false,
      ),
    );
  }

  /// Asked for on the way into duty rather than at first launch, where it reads
  /// as one more permission wall between a responder and the login screen.
  ///
  /// Only callable from the UI isolate — the platform side needs the activity to
  /// put the dialog on. Below Android 13 there is nothing to ask for and this
  /// reports whether notifications are switched on for the app.
  static Future<bool> requestPermission() async {
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    if (android == null) return true;
    try {
      return await android.requestNotificationsPermission() ?? false;
    } catch (_) {
      // A request already in flight throws rather than queueing. Fall back to
      // the state itself: a duty session must not be refused over a
      // double-tapped dialog.
      return await android.areNotificationsEnabled() ?? false;
    }
  }

  /// One incident, one notification row, replaced in place as it moves.
  ///
  /// [emergencyId] decides the row, so a fix landing on an alert that is already
  /// showing updates the text instead of ringing a second time.
  static Future<void> showIncident({
    required String emergencyId,
    required String title,
    required String body,
    bool alarm = true,
  }) async {
    if (!_ready) await init();
    await _plugin.show(
      notificationIdFor(emergencyId),
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          alertChannelId,
          'Emergency alerts',
          importance: alarm ? Importance.max : Importance.defaultImportance,
          priority: alarm ? Priority.max : Priority.defaultPriority,
          category: AndroidNotificationCategory.alarm,
          audioAttributesUsage: alarm
              ? AudioAttributesUsage.alarm
              : AudioAttributesUsage.notification,
          playSound: alarm,
          enableVibration: alarm,
          vibrationPattern: alarm ? _alarmVibration : null,
          // Puts the alert over the lock screen, which is the state the phone is
          // actually in when this matters.
          fullScreenIntent: alarm,
          visibility: NotificationVisibility.public,
          ticker: title,
          styleInformation: BigTextStyleInformation(body, contentTitle: title),
          // An alert the responder has not acted on should not quietly expire,
          // so it stays until it is tapped or the incident closes.
          autoCancel: true,
          ongoing: false,
        ),
      ),
      payload: emergencyId,
    );
  }

  /// Takes the row down once the incident is no longer anybody's to answer.
  static Future<void> cancelIncident(String emergencyId) async {
    if (!_ready) return;
    await _plugin.cancel(notificationIdFor(emergencyId));
  }

  /// Stable, positive, and the same in both isolates — the service posts the
  /// row and the UI may need to cancel it.
  static int notificationIdFor(String emergencyId) =>
      emergencyId.hashCode & 0x3FFFFFFF;

  /// Did the responder get here by tapping an alert? Returns the incident id.
  static Future<String?> launchPayload() async {
    final details = await _plugin.getNotificationAppLaunchDetails();
    if (details?.didNotificationLaunchApp != true) return null;
    return details?.notificationResponse?.payload;
  }

  /// Long-short-long. Distinguishable from an ordinary buzz through a jacket.
  static final Int64List _alarmVibration = Int64List.fromList(const [
    0,
    700,
    250,
    700,
    250,
    900,
  ]);

  @visibleForTesting
  static void resetForTest() => _ready = false;
}
