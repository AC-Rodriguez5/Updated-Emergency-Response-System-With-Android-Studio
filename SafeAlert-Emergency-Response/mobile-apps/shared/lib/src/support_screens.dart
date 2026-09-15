import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'api.dart';
import 'controller.dart';
import 'emergency_screens.dart';
import 'platform_services.dart';
import 'ui.dart';

class FacilitiesScreen extends StatefulWidget {
  final AppController controller;
  const FacilitiesScreen({super.key, required this.controller});
  @override
  State<FacilitiesScreen> createState() => _FacilitiesScreenState();
}

class _FacilitiesScreenState extends State<FacilitiesScreen> {
  List<Json> facilities = [];
  Json? location, selected;
  List<LatLng> route = [];
  String type = 'hospital';
  String? error, summary;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
      selected = null;
      route = [];
    });
    try {
      location = await widget.controller.locator.current();
      final result =
          (await widget.controller.api.request(
                'GET',
                '/facilities/nearby?lat=${location!['lat']}&lng=${location!['lng']}&type=$type&radius=5000',
              ))['data']
              as Json;
      facilities = (result['facilities'] as List).cast<Json>();
    } catch (e) {
      error = '$e';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> directions(Json facility) async {
    setState(() {
      busy = true;
      error = null;
      selected = facility;
    });
    try {
      final destination = facility['location'] is Json
          ? facility['location'] as Json
          : facility;
      final result =
          (await widget.controller.api.request(
                'GET',
                '/routes?fromLat=${location!['lat']}&fromLng=${location!['lng']}&toLat=${destination['lat']}&toLng=${destination['lng']}',
              ))['data']
              as Json;
      route = (result['coordinates'] as List).cast<Json>().map(point).toList();
      summary =
          '${((result['distanceMeters'] as num) / 1000).toStringAsFixed(1)} km · ${((result['durationSeconds'] as num) / 60).ceil()} min';
    } catch (e) {
      error = '$e';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageBody(
    children: [
      Text(
        'Nearby facilities',
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(
        initialValue: type,
        decoration: const InputDecoration(labelText: 'Facility type'),
        items: const [
          DropdownMenuItem(value: 'hospital', child: Text('Hospitals')),
          DropdownMenuItem(value: 'police', child: Text('Police stations')),
          DropdownMenuItem(value: 'fire_station', child: Text('Fire stations')),
          DropdownMenuItem(value: 'rescue', child: Text('Rescue stations')),
        ],
        onChanged: busy
            ? null
            : (v) {
                type = v!;
                load();
              },
      ),
      if (error != null) FeedbackPanel(error!, retry: load),
      if (busy)
        const Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator()),
        ),
      if (location != null)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: SizedBox(
            height: 300,
            child: FlutterMap(
              options: MapOptions(
                initialCenter: point(location!),
                initialZoom: 14,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'ph.safealert.mobile',
                ),
                if (route.isNotEmpty)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: route,
                        color: SafeAlertTheme.blue,
                        strokeWidth: 5,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: point(location!),
                      child: const Icon(
                        Icons.my_location,
                        color: SafeAlertTheme.blue,
                      ),
                    ),
                    for (final f in facilities)
                      Marker(
                        width: 48,
                        height: 48,
                        point: point(
                          f['location'] is Json ? f['location'] as Json : f,
                        ),
                        child: IconButton(
                          tooltip: 'View ${f['name']}',
                          onPressed: () => setState(() => selected = f),
                          icon: const Icon(
                            Icons.local_hospital,
                            color: SafeAlertTheme.ink,
                          ),
                        ),
                      ),
                  ],
                ),
                const SimpleAttributionWidget(
                  source: Text('© OpenStreetMap contributors'),
                ),
              ],
            ),
          ),
        ),
      if (selected != null)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${selected!['name']}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                Text('${selected!['phone'] ?? 'Phone number unavailable'}'),
                if (summary != null) Text(summary!),
                OutlinedButton.icon(
                  onPressed: busy ? null : () => directions(selected!),
                  icon: const Icon(Icons.route),
                  label: const Text('Get directions'),
                ),
              ],
            ),
          ),
        ),
      if (!busy && facilities.isEmpty)
        const FeedbackPanel(
          'No facilities found within 5 km. Choose another facility type or try again.',
          warning: true,
        ),
      for (final f in facilities)
        Card(
          child: ListTile(
            title: Text('${f['name']}'),
            subtitle: Text(
              '${f['phone'] ?? readable(type)}${f['distanceMeters'] is num ? ' · ${((f['distanceMeters'] as num) / 1000).toStringAsFixed(1)} km' : ''}',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => setState(() => selected = f),
          ),
        ),
    ],
  );
}

class DevicesScreen extends StatefulWidget {
  final AppController controller;
  final PlatformServices platform;
  const DevicesScreen({
    super.key,
    required this.controller,
    required this.platform,
  });
  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  bool busy = false, enabled = false;
  String? error, testMessage;
  List<ScanResult> results = [];
  @override
  void initState() {
    super.initState();
    run(() async {
      enabled = await widget.platform.monitoring;
      await widget.controller.loadDevices();
    });
  }

  Future<void> run(Future<void> Function() work) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } catch (e) {
      error = '$e';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.platform.status;
    return PageBody(
      children: [
        Text('Panic button', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        const Text(
          'Pair your SafeAlert ESP32 and enable monitoring to send alerts using its physical buttons.',
        ),
        if (error != null) FeedbackPanel(error!),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Monitor panic button'),
          subtitle: const Text(
            'Shows an ongoing notification and keeps Bluetooth and location available.',
          ),
          value: enabled,
          onChanged: busy || widget.controller.devices.isEmpty
              ? null
              : (v) => run(() async {
                  await widget.platform.enableMonitoring(v);
                  enabled = v;
                }),
        ),
        StatusBadge(state['connected'] == true ? 'connected' : 'disconnected'),
        if (state['warning'] != null)
          FeedbackPanel('${state['warning']}', warning: true),
        if (state['queued'] is num && (state['queued'] as num) > 0)
          FeedbackPanel(
            '${state['queued']} panic button alert(s) waiting to send. Keep location enabled and reconnect to the internet.',
            warning: true,
          ),
        Text(
          'Battery: ${state['battery'] ?? 'Unknown'}${state['battery'] == null ? '' : '%'}',
        ),
        Text('Last button event: ${state['lastEvent'] ?? 'No event received'}'),
        for (final device in widget.controller.devices)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '${device['deviceName'] ?? 'SafeAlert panic button'}',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text('Device ID: ${device['deviceId']}'),
                  Text('Firmware: ${device['firmwareVersion'] ?? 'Unknown'}'),
                  OutlinedButton(
                    onPressed: busy
                        ? null
                        : () => run(() async {
                            if (await confirmAction(
                              context,
                              'Unpair this panic button?',
                              'Physical buttons will stop sending emergency alerts through this account.',
                              'Unpair device',
                              danger: true,
                            )) {
                              await widget.platform.unpair(device);
                              enabled = false;
                            }
                          }),
                    child: const Text('Unpair device'),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: busy
              ? null
              : () => run(() async {
                  results = await widget.platform.scan();
                }),
          icon: const Icon(Icons.bluetooth_searching),
          label: Text(busy ? 'Working…' : 'Scan for SafeAlert devices'),
        ),
        for (final result in results)
          Card(
            child: ListTile(
              title: Text(result.advertisementData.advName),
              subtitle: Text(
                'Bluetooth ID: ${result.device.remoteId.str}\nSignal: ${result.rssi} dBm',
              ),
              trailing: const Icon(Icons.add_link),
              onTap: busy
                  ? null
                  : () => run(() async {
                      await widget.platform.pair(result);
                      results = [];
                    }),
            ),
          ),
        if (!busy && results.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text(
              'Turn on your panic button and keep it near the phone before scanning.',
            ),
          ),
        OutlinedButton(
          onPressed: busy
              ? null
              : () => run(() async {
                  await widget.controller.loadDevices();
                  testMessage = state['connected'] == true
                      ? 'Connection verified. Physical button presses send real emergencies.'
                      : 'The panic button is disconnected. Enable monitoring and check its power.';
                }),
          child: const Text('Test connection'),
        ),
        if (testMessage != null) FeedbackPanel(testMessage!, warning: true),
      ],
    );
  }
}

class HistoryScreen extends StatefulWidget {
  final AppController controller;
  const HistoryScreen({super.key, required this.controller});
  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  int page = 1;
  bool busy = false;
  String? error;
  List<Json> items = [];
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      items =
          ((await widget.controller.api.request(
                    'GET',
                    '/emergencies/my?page=$page&limit=20',
                  ))['data']
                  as List)
              .cast<Json>();
    } catch (e) {
      error = '$e';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageBody(
    children: [
      Text(
        'Emergency history',
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      if (error != null) FeedbackPanel(error!, retry: load),
      if (busy) const Center(child: CircularProgressIndicator()),
      if (!busy && items.isEmpty)
        const FeedbackPanel('No emergencies on this page.', warning: true),
      for (final i in items)
        IncidentCard(
          incident: i,
          onTap: () async {
            try {
              await widget.controller.openIncident(recordId(i));
            } catch (e) {
              if (context.mounted) showFeedback(context, e);
            }
          },
        ),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          TextButton(
            onPressed: busy || page == 1
                ? null
                : () {
                    page--;
                    load();
                  },
            child: const Text('Previous'),
          ),
          Text('Page $page'),
          TextButton(
            onPressed: busy || items.length < 20
                ? null
                : () {
                    page++;
                    load();
                  },
            child: const Text('Next'),
          ),
        ],
      ),
    ],
  );
}
