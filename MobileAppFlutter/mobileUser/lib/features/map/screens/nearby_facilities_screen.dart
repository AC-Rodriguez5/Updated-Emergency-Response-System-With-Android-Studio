import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/config/app_config.dart';
import '../../../core/theme/app_colors.dart';

class NearbyFacilitiesScreen extends StatelessWidget {
  const NearbyFacilitiesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nearby Facilities')),
      body: Stack(
        children: [
          FlutterMap(
            options: MapOptions(
              initialCenter: LatLng(AppConfig.tanzaCenterLat, AppConfig.tanzaCenterLng),
              initialZoom: 13,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.tanzalert.app',
              ),
              MarkerLayer(markers: [
                Marker(
                  point: LatLng(AppConfig.tanzaCenterLat, AppConfig.tanzaCenterLng),
                  child: const Icon(Icons.local_hospital, color: AppColors.alertRed, size: 32),
                ),
              ]),
            ],
          ),
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: const Text(
                'Nearby hospitals, police stations and fire stations in Tanza will appear here.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
