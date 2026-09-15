import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter/services.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await dotenv.load(mode: 'development');

  final prefs = await SharedPreferences.getInstance();
  await prefs.getString('api_url')?.then((val) =>
    prefs.setString('api_url', 'http://localhost:5000/api'));

  FutureZoneConfiguration futureZoneConfiguration = FutureZoneConfiguration(
    onGestureCapture: (zone, zoneType, zoneReason, zoneInfo) {
      // Handle zone capture
    },
  );

  runApp(SafeAlertResponderApp(futureZoneConfiguration: futureZoneConfiguration));
}

class SafeAlertResponderApp extends StatelessWidget {
  final FutureZoneConfiguration futureZoneConfiguration;

  const SafeAlertResponderApp({super.key, required this.futureZoneConfiguration});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SafeAlert Responder',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
        scaffoldBackgroundColor: Colors.grey[100],
      ),
      darkTheme: ThemeData.dark(useMaterial3: true),
      home: AppProvider(),
    );
  }
}
