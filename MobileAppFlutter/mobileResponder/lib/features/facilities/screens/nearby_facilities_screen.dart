import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:safealert_ui/safealert_ui.dart';
import 'package:tanzalert_facilities/tanzalert_facilities.dart';

/// Where to take them from here.
///
/// Opened from an incident the responder has arrived at: the question stops
/// being "where is the patient" and becomes "which hospital, and how do I get
/// out of here fastest". Both apps read the same facility list, and the map
/// opens on the kind this emergency usually ends at.
class NearbyFacilitiesScreen extends StatefulWidget {
  /// Where the responder is — the scene, not the town centre.
  final double lat;
  final double lng;

  /// The incident's type, which decides what the map opens on.
  final String emergencyType;

  const NearbyFacilitiesScreen({
    super.key,
    required this.lat,
    required this.lng,
    this.emergencyType = 'medical',
  });

  @override
  State<NearbyFacilitiesScreen> createState() => _NearbyFacilitiesScreenState();
}

class _NearbyFacilitiesScreenState extends State<NearbyFacilitiesScreen> {
  static const _distance = Distance();
  static const _iconRingRadius = 21.0;

  final _service = EmergencyFacilityService();
  final _mapController = MapController();

  late EmergencyFacilityType _type = defaultFacilityTypeFor(widget.emergencyType);
  List<EmergencyFacility> _facilities = const [];
  bool _loading = true;
  bool _liveDataReached = true;
  String? _error;

  LatLng get _scene => LatLng(widget.lat, widget.lng);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final lookup = await _service.nearest(
        latitude: widget.lat,
        longitude: widget.lng,
        type: _type,
      );
      if (!mounted) return;
      setState(() {
        _facilities = lookup.facilities;
        _liveDataReached = lookup.liveDataReached;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load facilities. $e';
        _loading = false;
      });
    }
  }

  double _metresTo(EmergencyFacility facility) =>
      _distance.as(LengthUnit.Meter, _scene, facility.point);

  String _distanceLabel(EmergencyFacility facility) {
    final metres = _metresTo(facility);
    return metres < 1000
        ? '${metres.round()} m away'
        : '${(metres / 1000).toStringAsFixed(1)} km away';
  }

  void _openFacility(EmergencyFacility facility) {
    final style = facilityStyleFor(facility.type);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: style.color,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(style.icon, size: 20, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        facility.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textStrong,
                        ),
                      ),
                      Text(
                        '${style.label} · ${_distanceLabel(facility)}',
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (facility.address != null) ...[
              const SizedBox(height: 10),
              Text(
                facility.address!,
                style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
              ),
            ],
            const SizedBox(height: 18),
            AppButton(
              label: 'Easiest way there',
              icon: Icons.navigation,
              onPressed: () {
                Navigator.pop(sheetContext);
                context.push(
                  '/route',
                  extra: {
                    'lat': facility.latitude,
                    'lng': facility.longitude,
                    'label': facility.name,
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  List<Marker> _markers() {
    const iconSize = 38.0;
    const boxSize = iconSize + 2 * _iconRingRadius;
    // Municipal compounds stack a fire station, an MDRRMO office and a police
    // station on nearly one point; without this the last pin drawn hides the
    // rest and they cannot be tapped at all.
    final nudges = facilityIconNudges(
      _facilities,
      ringRadiusPx: _iconRingRadius,
    );

    return [
      Marker(
        point: _scene,
        width: 44,
        height: 44,
        child: const Icon(
          Icons.my_location,
          size: 30,
          color: AppColors.responderBlue,
        ),
      ),
      ..._facilities.map((facility) {
        final style = facilityStyleFor(facility.type);
        final nudge = nudges[facility.id] ?? (dx: 0.0, dy: 0.0);
        return Marker(
          point: facility.point,
          width: boxSize,
          height: boxSize,
          child: Center(
            child: Transform.translate(
              offset: Offset(nudge.dx, nudge.dy),
              child: GestureDetector(
                onTap: () => _openFacility(facility),
                child: Tooltip(
                  message: facility.name,
                  child: Container(
                    width: iconSize,
                    height: iconSize,
                    decoration: BoxDecoration(
                      color: style.color,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                      boxShadow: const [
                        BoxShadow(
                          color: Colors.black26,
                          blurRadius: 4,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Icon(style.icon, size: 19, color: Colors.white),
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final sorted = _facilities.toList()
      ..sort((a, b) => _metresTo(a).compareTo(_metresTo(b)));
    final closest = sorted.take(3).toList();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Nearest facilities'),
        actions: [
          IconButton(
            tooltip: 'Reload',
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 54,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              itemCount: EmergencyFacilityType.values.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final type = EmergencyFacilityType.values[i];
                final style = facilityStyleFor(type);
                return ChoiceChip(
                  avatar: Icon(style.icon, size: 15, color: style.color),
                  label: Text(style.label),
                  labelStyle: const TextStyle(fontSize: 12),
                  selected: _type == type,
                  onSelected: _loading
                      ? null
                      : (_) {
                          setState(() => _type = type);
                          _load();
                        },
                );
              },
            ),
          ),
          if (!_liveDataReached && !_loading)
            Container(
              width: double.infinity,
              color: const Color(0xFFFEF3C7),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: const Text(
                'Offline list only — live map data could not be reached. These '
                'are the places bundled with the app, not everything nearby.',
                style: TextStyle(fontSize: 11.5, color: Color(0xFF92400E)),
              ),
            ),
          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: _scene,
                    initialZoom: 14,
                    interactionOptions: const InteractionOptions(
                      flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                    ),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'ph.tanza.tanzalert.responder',
                    ),
                    MarkerLayer(markers: _markers()),
                  ],
                ),
                if (_loading)
                  const Align(
                    alignment: Alignment.topCenter,
                    child: Padding(
                      padding: EdgeInsets.all(12),
                      child: Card(
                        child: Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 10,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox.square(
                                dimension: 14,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                              SizedBox(width: 10),
                              Text('Finding places nearby…'),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                if (_error != null)
                  Align(
                    alignment: Alignment.topCenter,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Card(
                        color: AppColors.softRed,
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(
                            _error!,
                            style: const TextStyle(
                              color: AppColors.alertRed,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (closest.isNotEmpty)
            Container(
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final facility in closest)
                    ListTile(
                      dense: true,
                      leading: Icon(
                        facilityStyleFor(facility.type).icon,
                        color: facilityStyleFor(facility.type).color,
                      ),
                      title: Text(
                        facility.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14),
                      ),
                      subtitle: Text(_distanceLabel(facility)),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => _openFacility(facility),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
