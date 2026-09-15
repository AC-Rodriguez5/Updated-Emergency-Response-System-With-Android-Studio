import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'api.dart';
import 'controller.dart';
import 'ui.dart';

const types = {
  'medical': (Icons.medical_services, 'Medical'),
  'crime': (Icons.security, 'Crime'),
  'fire': (Icons.local_fire_department, 'Fire'),
  'general_sos': (Icons.sos, 'General SOS'),
};

class HomeScreen extends StatefulWidget {
  final AppController controller;
  const HomeScreen({super.key, required this.controller});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String type = '', status = '', priority = '';
  double? maxDistance;
  AppController get c => widget.controller;
  Future<void> attempt(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      if (mounted) showFeedback(context, e);
    }
  }

  Future<void> send(String type, bool held) async {
    if (!held &&
        !await confirmAction(
          context,
          'Send ${types[type]!.$2} emergency?',
          'Your current location will be shared with authorized responders.',
          'Send emergency',
          danger: true,
        )) {
      return;
    }
    await attempt(() => c.submit(type));
  }

  @override
  Widget build(BuildContext context) {
    final list = c.active
        .where(
          (i) =>
              (type.isEmpty || i['type'] == type) &&
              (status.isEmpty || i['status'] == status) &&
              (priority.isEmpty || (i['priority'] ?? (['crime','fire'].contains(i['type']) ? 'critical' : 'high')) == priority) &&
              (maxDistance == null ||
                  c.currentLocation != null &&
                      const Distance().as(
                            LengthUnit.Kilometer,
                            point(c.currentLocation!),
                            point(i['location'] as Json),
                          ) <=
                          maxDistance!),
        )
        .toList();
    return RefreshIndicator(
      onRefresh: c.sync,
      child: PageBody(
        children: [
          Row(
            children: [
              Icon(c.live ? Icons.wifi : Icons.sync, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  c.live
                      ? 'Live updates connected'
                      : 'Reconnecting · updates refresh every 10 seconds',
                  style: const TextStyle(fontSize: 14),
                ),
              ),
            ],
          ),
          if (c.error != null) FeedbackPanel(c.error!, retry: () => c.sync()),
          if (c.serviceWarning != null)
            FeedbackPanel(c.serviceWarning!, warning: true),
          if (c.shouldTrack)
            const FeedbackPanel(
              'Emergency location sharing is active.',
              warning: true,
            ),
          for (final item in c.queue.items)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      '${types[item['type']]?.$2 ?? 'Emergency'} · not confirmed sent',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    Text(
                      c.queue.needsReview(item)
                          ? 'This saved attempt is more than 10 minutes old. Choose whether to send it.'
                          : c.queue.message ??
                                'Waiting for connection to send emergency.',
                    ),
                    Wrap(
                      spacing: 8,
                      children: [
                        TextButton(
                          onPressed: c.busy
                              ? null
                              : () => attempt(() async {
                                  await c.queue.approveRetry(item);
                                  await c.flushQueue();
                                }),
                          child: const Text('Retry same attempt'),
                        ),
                        TextButton(
                          onPressed: c.busy
                              ? null
                              : () => attempt(() async {
                                  if (await confirmAction(
                                    context,
                                    'Discard saved attempt?',
                                    'The server may have received an earlier request. Discarding does not cancel any incident already created.',
                                    'Discard attempt',
                                    danger: true,
                                  )) {
                                    await c.queue.discard(item);
                                    await c.sync();
                                  }
                                }),
                          child: const Text('Discard'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          if (c.role == 'responder') ...[
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(c.isOnDuty ? 'On duty' : 'Off duty'),
              subtitle: const Text('Share location while on duty or assigned.'),
              value: c.isOnDuty,
              onChanged: c.busy ? null : (v) => attempt(() => c.setDuty(v)),
            ),
            Text(
              'Active emergencies',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(
                  label: const Text('All types'),
                  selected: type.isEmpty,
                  onSelected: (_) => setState(() => type = ''),
                ),
                for (final t in types.entries)
                  FilterChip(
                    label: Text(t.value.$2),
                    selected: type == t.key,
                    onSelected: (_) =>
                        setState(() => type = type == t.key ? '' : t.key),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: status,
              decoration: const InputDecoration(labelText: 'Status'),
              items: [
                const DropdownMenuItem(
                  value: '',
                  child: Text('All active statuses'),
                ),
                for (final s in [
                  'pending',
                  'assigned',
                  'responder_on_the_way',
                  'responder_nearby',
                  'responder_report_submitted',
                ])
                  DropdownMenuItem(value: s, child: Text(readable(s))),
              ],
              onChanged: (v) => setState(() => status = v!),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: priority,
              decoration: const InputDecoration(labelText: 'Priority'),
              items: const [
                DropdownMenuItem(value: '', child: Text('All priorities')),
                DropdownMenuItem(value: 'critical', child: Text('Critical')),
                DropdownMenuItem(value: 'high', child: Text('High')),
              ],
              onChanged: (v) => setState(() => priority = v!),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<double>(
              initialValue: maxDistance ?? 0,
              decoration: const InputDecoration(labelText: 'Distance'),
              items: const [
                DropdownMenuItem(value: 0, child: Text('Any distance')),
                DropdownMenuItem(value: 5, child: Text('Within 5 km')),
                DropdownMenuItem(value: 20, child: Text('Within 20 km')),
              ],
              onChanged: (v) => attempt(() async {
                if (v != 0) c.currentLocation = await c.locator.current();
                setState(() => maxDistance = v == 0 ? null : v);
              }),
            ),
            if (list.isNotEmpty)
              IncidentMap(
                incidents: list,
                current: c.currentLocation,
                onSelect: (i) => attempt(() => c.openIncident(recordId(i))),
              ),
          ] else ...[
            const SizedBox(height: 24),
            Text(
              c.active.isEmpty
                  ? 'What help do you need?'
                  : 'Your active emergency',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            const Text('Tap to confirm, or hold for 2 seconds to send.'),
            const SizedBox(height: 16),
            if (c.active.isEmpty)
              for (final type in types.entries)
                HoldEmergencyButton(
                  type: type.key,
                  enabled: !c.busy && c.queue.items.isEmpty,
                  onTrigger: (held) => send(type.key, held),
                ),
          ],
          if (c.refreshing && c.incidents.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            ),
          if (c.role == 'responder' && list.isEmpty && !c.refreshing)
            const FeedbackPanel(
              'No active emergencies match these filters. New incidents in your coverage area will appear here.',
              warning: true,
            ),
          for (final incident in list)
            IncidentCard(
              incident: incident,
              onTap: () => attempt(() => c.openIncident(recordId(incident))),
            ),
        ],
      ),
    );
  }
}

class HoldEmergencyButton extends StatefulWidget {
  final String type;
  final bool enabled;
  final Future<void> Function(bool held) onTrigger;
  const HoldEmergencyButton({
    super.key,
    required this.type,
    required this.enabled,
    required this.onTrigger,
  });
  @override
  State<HoldEmergencyButton> createState() => _HoldEmergencyButtonState();
}

class _HoldEmergencyButtonState extends State<HoldEmergencyButton> {
  Timer? timer;
  Offset? origin;
  bool fired = false, holding = false;
  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  void stop() {
    timer?.cancel();
    if (mounted) setState(() => holding = false);
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Listener(
      onPointerDown: widget.enabled
          ? (event) {
              origin = event.position;
              fired = false;
              setState(() => holding = true);
              timer = Timer(const Duration(seconds: 2), () {
                fired = true;
                stop();
                widget.onTrigger(true);
              });
            }
          : null,
      onPointerUp: (_) => stop(),
      onPointerCancel: (_) => stop(),
      onPointerMove: (event) { if(origin != null && (event.position-origin!).distance > 20) stop(); },
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor: SafeAlertTheme.red,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 100),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        onPressed: widget.enabled
            ? () {
                if (!fired) widget.onTrigger(false);
              }
            : null,
        icon: Icon(types[widget.type]!.$1, size: 40),
        label: Text(
          holding ? 'Keep holding…' : types[widget.type]!.$2,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
      ),
    ),
  );
}

class IncidentCard extends StatelessWidget {
  final Json incident;
  final VoidCallback onTap;
  const IncidentCard({super.key, required this.incident, required this.onTap});
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      contentPadding: const EdgeInsets.all(16),
      leading: Icon(types[incident['type']]?.$1 ?? Icons.sos),
      title: Text(types[incident['type']]?.$2 ?? 'Emergency'),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StatusBadge('${incident['status']}'),
          Text(
            localTime(incident['createdAt']),
            style: const TextStyle(fontSize: 14),
          ),
        ],
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}

LatLng point(Json location) => LatLng(
  (location['lat'] as num).toDouble(),
  (location['lng'] as num).toDouble(),
);

class IncidentMap extends StatelessWidget {
  final List<Json> incidents;
  final Json? current;
  final List<LatLng> route;
  final void Function(Json)? onSelect;
  const IncidentMap({
    super.key,
    required this.incidents,
    this.current,
    this.route = const [],
    this.onSelect,
  });
  @override
  Widget build(BuildContext context) {
    final positions = incidents.where((i) => i['location'] is Json).toList();
    if (positions.isEmpty && current == null) {
      return const FeedbackPanel(
        'Acquire your location to display the map.',
        warning: true,
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: SizedBox(
        height: 300,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: FlutterMap(
            options: MapOptions(
              initialCenter: current != null
                  ? point(current!)
                  : point(positions.first['location'] as Json),
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
                  if (current != null)
                    Marker(
                      point: point(current!),
                      child: const Tooltip(
                        message: 'Your current location',
                        child: Icon(
                          Icons.my_location,
                          color: SafeAlertTheme.blue,
                          size: 32,
                        ),
                      ),
                    ),
                  for (final i in positions)
                    Marker(
                      point: point(i['location'] as Json),
                      width: 48,
                      height: 48,
                      child: IconButton(
                        tooltip: 'Open ${readable('${i['type']}')}',
                        onPressed: onSelect == null ? null : () => onSelect!(i),
                        icon: Icon(
                          types[i['type']]?.$1 ?? Icons.location_pin,
                          color: SafeAlertTheme.red,
                          size: 32,
                        ),
                      ),
                    ),
                  for (final i in positions)
                    if (i['responderLocation'] is Json)
                      Marker(
                        point: point(i['responderLocation'] as Json),
                        child: const Tooltip(
                          message: 'Assigned responder',
                          child: Icon(
                            Icons.local_police,
                            color: SafeAlertTheme.blue,
                            size: 32,
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
    );
  }
}

class IncidentDetail extends StatefulWidget {
  final AppController controller;
  final Json incident;
  const IncidentDetail({
    super.key,
    required this.controller,
    required this.incident,
  });
  @override
  State<IncidentDetail> createState() => _IncidentDetailState();
}

class _IncidentDetailState extends State<IncidentDetail> {
  List<LatLng> route = [];
  String? error, routeSummary;
  bool loadingRoute = false;
  final notes = TextEditingController(),
      actions = TextEditingController(),
      arrival = TextEditingController(
        text: DateTime.now().toUtc().toIso8601String(),
      );
  final reportForm = GlobalKey<FormState>();
  AppController get c => widget.controller;
  Json get i => widget.incident;
  @override
  void dispose() {
    notes.dispose();
    actions.dispose();
    arrival.dispose();
    super.dispose();
  }

  Future<void> act(String action, {Json? body}) async {
    setState(() => error = null);
    try {
      await c.action(i, action, body: body);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> getRoute() async {
    setState(() {
      loadingRoute = true;
      error = null;
    });
    try {
      final origin = await c.locator.current();
      c.currentLocation = origin;
      final target = i['location'] as Json;
      final result =
          (await c.api.request(
                'GET',
                '/routes?fromLat=${origin['lat']}&fromLng=${origin['lng']}&toLat=${target['lat']}&toLng=${target['lng']}',
              ))['data']
              as Json;
      if (mounted) {
        setState(() {
          route = (result['coordinates'] as List)
              .cast<Json>()
              .map(point)
              .toList();
          routeSummary =
              '${((result['distanceMeters'] as num) / 1000).toStringAsFixed(1)} km · ${((result['durationSeconds'] as num) / 60).ceil()} min';
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loadingRoute = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final assigned = i['assignedResponderId'] == recordId(c.account ?? {});
    final location = i['location'] as Json?;
    return PageBody(
      children: [
        Text(
          '${types[i['type']]?.$2 ?? 'Emergency'} response',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        StatusBadge('${i['status']}'),
        Text('Incident ${recordId(i)}', style: const TextStyle(fontSize: 14)),
        Text(
          'Updated ${localTime(i['updatedAt'])}',
          style: const TextStyle(fontSize: 14),
        ),
        if (error != null) FeedbackPanel(error!),
        if (c.error != null) FeedbackPanel(c.error!, retry: () => c.sync()),
        if (c.shouldTrack)
          const FeedbackPanel(
            'Your location is being shared during this response.',
            warning: true,
          ),
        if (i['user'] is Json)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.person_outline),
            title: Text('${i['user']['name'] ?? 'Resident'}'),
            subtitle: Text('${i['user']['phone'] ?? ''}'),
          ),
        if (i['responder'] is Json)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.local_police_outlined),
            title: Text('${i['responder']['name'] ?? 'Assigned responder'}'),
            subtitle: Text('${i['responder']['phone'] ?? ''}'),
          ),
        if (i['notes'] != null && '${i['notes']}'.isNotEmpty)
          Text('Notes: ${i['notes']}'),
        IncidentMap(incidents: [i], current: c.currentLocation, route: route),
        if (location != null) ...[
          Text(
            'Emergency location: ${location['lat']}, ${location['lng']}',
            style: const TextStyle(fontSize: 14),
          ),
          Text(
            'Accuracy: ${location['accuracyMeters']} m · Captured ${localTime(location['capturedAt'])}',
            style: const TextStyle(fontSize: 14),
          ),
        ],
        if (c.role == 'responder') ...[
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: loadingRoute ? null : getRoute,
            icon: const Icon(Icons.route),
            label: Text(loadingRoute ? 'Loading route…' : 'Get route'),
          ),
          if (routeSummary != null) Text(routeSummary!),
          if (i['status'] == 'pending')
            FilledButton(
              onPressed: c.busy ? null : () => act('assign'),
              child: const Text('Accept assignment'),
            ),
          if (assigned && i['status'] == 'assigned')
            FilledButton(
              onPressed: c.busy ? null : () => act('on-the-way'),
              child: const Text('Mark on the way'),
            ),
          if (assigned && i['status'] == 'responder_on_the_way')
            const FeedbackPanel(
              'Your status will change to nearby when your shared GPS location reaches the emergency.',
              warning: true,
            ),
          if (assigned && i['status'] == 'responder_nearby') ...[
            const SizedBox(height: 24),
            Text(
              'On-ground report',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            Form(
              key: reportForm,
              child: Column(
                children: [
                  TextFormField(
                    controller: arrival,
                    decoration: const InputDecoration(
                      labelText: 'Arrival timestamp (ISO 8601)',
                    ),
                    validator: (v) => DateTime.tryParse(v ?? '') == null
                        ? 'Enter a valid arrival timestamp.'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: notes,
                    decoration: const InputDecoration(
                      labelText: 'Situation notes',
                    ),
                    maxLines: 4,
                    maxLength: 2000,
                    validator: requiredValue,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: actions,
                    decoration: const InputDecoration(
                      labelText: 'Action taken',
                    ),
                    maxLines: 4,
                    maxLength: 2000,
                    validator: requiredValue,
                  ),
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.admin_panel_settings),
                    title: Text('Administrator resolution is required.'),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: c.busy
                          ? null
                          : () {
                              if (reportForm.currentState!.validate()) {
                                act(
                                  'report',
                                  body: {
                                    'situationNotes': notes.text.trim(),
                                    'actionTaken': actions.text.trim(),
                                    'arrivalTimestamp': DateTime.parse(
                                      arrival.text,
                                    ).toUtc().toIso8601String(),
                                  },
                                );
                              }
                            },
                      child: const Text('Submit report for review'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
        if (c.role == 'user' && i['status'] == 'pending') ...[
          const SizedBox(height: 24),
          OutlinedButton(
            onPressed: c.busy
                ? null
                : () async {
                    if (await confirmAction(
                      context,
                      'Cancel this emergency?',
                      'Cancellation is available only before a responder is assigned.',
                      'Cancel emergency',
                      danger: true,
                    )) {
                      await act('cancel');
                    }
                  },
            child: const Text('Cancel emergency'),
          ),
        ],
        const SizedBox(height: 24),
        Text(
          'Response timeline',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        if (i['timeline'] is List)
          for (final event in i['timeline'] as List)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.check_circle_outline),
              title: Text(
                readable(
                  '${event['status'] ?? event['to'] ?? event['name'] ?? 'Update'}',
                ),
              ),
              subtitle: Text(
                '${localTime(event['at'])}${event['reason'] == null ? '' : '\n${event['reason']}'}',
              ),
            ),
      ],
    );
  }
}
