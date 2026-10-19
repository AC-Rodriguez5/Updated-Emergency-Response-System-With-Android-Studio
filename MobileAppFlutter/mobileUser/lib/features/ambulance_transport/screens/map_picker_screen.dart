import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/config/app_config.dart';
import '../../../core/theme/app_colors.dart';
import 'package:tanzalert_facilities/tanzalert_facilities.dart';
import '../models/facility_search_query.dart';
import '../services/nominatim_service.dart';

class MapPickerResult {
  final double lat;
  final double lng;
  final String label;
  const MapPickerResult({
    required this.lat,
    required this.lng,
    required this.label,
  });
}

/// Which end of the trip is being picked. Pickup is "where I am", so it leads
/// with GPS; drop-off is "which facility", so it plots emergency facilities and
/// offers a search box.
enum MapPickerMode { pickup, dropoff }

/// A destination the user chose outright — a facility icon, or a search result
/// — rather than one implied by where the pin happens to sit.
///
/// Holding on to the point as well as the label is what lets the pin keep an
/// explicitly chosen label while the map settles, and give it up once the user
/// pans somewhere else.
class _PinnedChoice {
  final String label;
  final LatLng point;

  /// Set when the choice came from a facility icon, so the icon can be drawn
  /// as selected and a late address lookup can confirm it is still current.
  final String? facilityId;

  const _PinnedChoice({
    required this.label,
    required this.point,
    this.facilityId,
  });
}

class MapPickerScreen extends StatefulWidget {
  final String title;
  final MapPickerMode mode;
  final double? initialLat;
  final double? initialLng;
  final String? initialLabel;

  const MapPickerScreen({
    super.key,
    required this.title,
    required this.mode,
    this.initialLat,
    this.initialLng,
    this.initialLabel,
  });

  @override
  State<MapPickerScreen> createState() => _MapPickerScreenState();
}

class _MapPickerScreenState extends State<MapPickerScreen> {
  final MapController _mapController = MapController();
  final _labelCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  final _searchFocus = FocusNode();
  final NominatimService _nominatim = NominatimService();
  final EmergencyFacilityService _facilityService = EmergencyFacilityService();

  LatLng _center = LatLng(AppConfig.tanzaCenterLat, AppConfig.tanzaCenterLng);
  bool _isDragging = false;
  bool _gpsBusy = true;

  /// Where the phone says it is, kept so "near me" means near the user rather
  /// than near whatever part of the map they happen to be looking at.
  LatLng? _myLocation;

  /// True while the label is still mirroring the pin. The moment the user types
  /// their own wording ("Lola's house, back gate"), the map stops overwriting
  /// it — a hand-written label is information we do not have and must not lose.
  bool _labelFollowsPin = true;
  bool _resolvingLabel = false;

  _PinnedChoice? _pinned;

  List<EmergencyFacility> _facilities = const [];
  bool _loadingFacilities = false;
  bool _liveFacilitiesReached = true;

  // Search state. Facility hits and place hits are kept apart because they are
  // answers to different questions and read differently in the list.
  List<EmergencyFacility> _facilityHits = const [];
  List<NominatimResult> _placeHits = const [];
  bool _searching = false;
  LatLng? _searchOrigin;
  String? _searchEmptyMessage;

  Timer? _settleDebounce;
  Timer? _searchDebounce;

  bool get _isDropoff => widget.mode == MapPickerMode.dropoff;
  bool get _hasSearchResults =>
      _facilityHits.isNotEmpty ||
      _placeHits.isNotEmpty ||
      _searchEmptyMessage != null;

  @override
  void initState() {
    super.initState();
    if (widget.initialLat != null && widget.initialLng != null) {
      _center = LatLng(widget.initialLat!, widget.initialLng!);
      _gpsBusy = false;
    }
    final initialLabel = widget.initialLabel ?? '';
    _labelCtrl.text = initialLabel;
    // Coming back to a location already chosen, their label is the source of
    // truth; only a fresh pick starts out following the pin.
    if (initialLabel.trim().isNotEmpty) _labelFollowsPin = false;
    if (widget.initialLat == null) {
      // Centring a fresh pick on the user is useful in both modes, but only a
      // pickup should take its label from where they are standing: a drop-off
      // labelled with the patient's own address would be wrong by default.
      _locateMe(fillLabel: !_isDropoff);
    }
  }

  @override
  void dispose() {
    _settleDebounce?.cancel();
    _searchDebounce?.cancel();
    _labelCtrl.dispose();
    _searchCtrl.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- location

  Future<void> _locateMe({bool fillLabel = true}) async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Location permission denied. Pan the map to your location instead.',
              ),
            ),
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (!mounted) return;
      final loc = LatLng(pos.latitude, pos.longitude);
      setState(() {
        _center = loc;
        _myLocation = loc;
        _pinned = null;
        // Pressing GPS is an explicit "use where I am", so it takes the label
        // back over even if it had been typed by hand.
        if (fillLabel) _labelFollowsPin = true;
      });
      _mapController.move(loc, 17);
      if (fillLabel) await _fillLabelFromPin(loc);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not read GPS. Pan the map to your location.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _gpsBusy = false);
    }
  }

  /// Writes the address of whatever the pin is currently over into the label.
  Future<void> _fillLabelFromPin(LatLng point) async {
    setState(() => _resolvingLabel = true);
    final address = await _nominatim.reverseGeocode(
      point.latitude,
      point.longitude,
    );
    if (!mounted) return;
    setState(() {
      _resolvingLabel = false;
      // Guard against a slow lookup landing after the user started typing.
      if (!_labelFollowsPin) return;
      _labelCtrl.text = address ?? _coordsLabel(point);
    });
  }

  String _coordsLabel(LatLng p) =>
      '${p.latitude.toStringAsFixed(5)}, ${p.longitude.toStringAsFixed(5)}';

  // ---------------------------------------------------------------- map state

  void _onMapEvent(MapEvent event) {
    if (event is MapEventMoveStart) {
      setState(() => _isDragging = true);
    } else if (event is MapEventMoveEnd ||
        event is MapEventFlingAnimationEnd) {
      setState(() => _isDragging = false);
    }
    setState(() => _center = event.camera.center);

    // One debounce covers every way the camera can change — drag, fling,
    // pinch, double-tap, programmatic move — so neither the geocoder nor
    // Overpass is hit mid-gesture.
    _settleDebounce?.cancel();
    _settleDebounce = Timer(const Duration(milliseconds: 600), _onMapSettled);
  }

  Future<void> _onMapSettled() async {
    if (!mounted) return;
    if (_isDropoff) _loadFacilities();

    // Still sitting on what they picked: that name and address is a better
    // label than whatever the geocoder would say about the same rooftop. This
    // also absorbs the move events our own [MapController.move] emits when
    // centring on a choice.
    final pinned = _pinned;
    if (pinned != null) {
      if (_metresFrom(pinned.point) < 40) return;
      setState(() => _pinned = null);
    }
    if (_labelFollowsPin) await _fillLabelFromPin(_center);
  }

  double _metresFrom(LatLng point) =>
      const Distance().as(LengthUnit.Meter, _center, point);

  // ---------------------------------------------------------------- facilities

  Future<void> _loadFacilities() async {
    final LatLngBounds bounds;
    final double zoom;
    try {
      bounds = _mapController.camera.visibleBounds;
      zoom = _mapController.camera.zoom;
    } catch (_) {
      return; // camera not mounted yet
    }

    setState(() => _loadingFacilities = true);
    final lookup = await _facilityService.inBounds(
      south: bounds.south,
      west: bounds.west,
      north: bounds.north,
      east: bounds.east,
      zoom: zoom,
    );
    if (!mounted) return;
    setState(() {
      _facilities = lookup.facilities;
      _liveFacilitiesReached = lookup.liveDataReached;
      _loadingFacilities = false;
    });
  }

  /// Centres the pin on a facility and logs its full name and address into the
  /// label, which is the whole point of showing the icons.
  Future<void> _selectFacility(EmergencyFacility facility) async {
    setState(() {
      _pinned = _PinnedChoice(
        // Name first, so the field is never momentarily empty while the
        // address is fetched; the address is appended when it arrives.
        label: facility.labelWith(null),
        point: facility.point,
        facilityId: facility.id,
      );
      _center = facility.point;
      _labelFollowsPin = true;
      _labelCtrl.text = facility.labelWith(null);
      _resolvingLabel = facility.address == null;
    });
    _dismissSearch();
    _mapController.move(facility.point, 17);

    if (facility.address != null) return;
    final address = await _nominatim.reverseGeocode(
      facility.latitude,
      facility.longitude,
    );
    if (!mounted) return;
    setState(() {
      _resolvingLabel = false;
      // Only fill in if the user has not moved on to another choice or started
      // typing in the meantime.
      if (_pinned?.facilityId != facility.id || !_labelFollowsPin) return;
      final full = facility.labelWith(address);
      _labelCtrl.text = full;
      _pinned = _PinnedChoice(
        label: full,
        point: facility.point,
        facilityId: facility.id,
      );
    });
  }

  // ------------------------------------------------------------------- search

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    if (value.trim().isEmpty) {
      setState(() {
        _facilityHits = const [];
        _placeHits = const [];
        _searchEmptyMessage = null;
        _searching = false;
      });
      return;
    }
    _searchDebounce = Timer(
      const Duration(milliseconds: 400),
      () => _runSearch(value),
    );
  }

  /// Two kinds of question, two kinds of answer.
  ///
  /// "hospital near me", "nearest police station", "bumbero" name a kind of
  /// facility, and are answered from the facility list ranked by distance.
  /// Anything else — "Divine Grace", "Daang Amaya", a barangay — is a place
  /// name, and goes to the geocoder. A facility question that finds nothing
  /// falls through to the geocoder rather than dead-ending.
  Future<void> _runSearch(String value) async {
    final query = FacilitySearchQuery.parse(value);
    if (query.raw.isEmpty) return;

    setState(() {
      _searching = true;
      _searchEmptyMessage = null;
    });

    if (query.isFacilitySearch) {
      final origin = _myLocation ?? _center;
      final lookup = await _facilityService.nearest(
        latitude: origin.latitude,
        longitude: origin.longitude,
        type: query.type,
        nameTerms: query.terms,
      );
      if (!mounted) return;
      if (lookup.facilities.isNotEmpty) {
        setState(() {
          _facilityHits = lookup.facilities;
          _placeHits = const [];
          _searchOrigin = origin;
          _liveFacilitiesReached = lookup.liveDataReached;
          _searching = false;
        });
        return;
      }
    }

    final places = await _nominatim.search(query.raw);
    if (!mounted) return;
    setState(() {
      _facilityHits = const [];
      _placeHits = places;
      _searching = false;
      _searchEmptyMessage = places.isEmpty
          ? 'Nothing found for "${query.raw}". Try a facility name, or pan the map.'
          : null;
    });
  }

  /// Uses a geocoder hit: the pin goes there and its full name becomes the
  /// label, the same contract as tapping a facility icon.
  void _selectPlace(NominatimResult result) {
    final point = LatLng(result.latitude, result.longitude);
    setState(() {
      _pinned = _PinnedChoice(label: result.displayName, point: point);
      _center = point;
      _labelFollowsPin = true;
      _labelCtrl.text = result.displayName;
      _resolvingLabel = false;
    });
    _dismissSearch();
    _mapController.move(point, 17);
  }

  void _dismissSearch() {
    _searchDebounce?.cancel();
    _searchFocus.unfocus();
    setState(() {
      _facilityHits = const [];
      _placeHits = const [];
      _searchEmptyMessage = null;
      _searching = false;
    });
  }

  void _confirm() {
    final label = _labelCtrl.text.trim();
    if (label.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Enter a location label (e.g. Home, Tanza General Hospital)',
          ),
        ),
      );
      return;
    }
    Navigator.of(context).pop(
      MapPickerResult(
        lat: _center.latitude,
        lng: _center.longitude,
        label: label,
      ),
    );
  }

  // ---------------------------------------------------------------------- UI

  static ({IconData icon, Color color, String label}) _styleFor(
    EmergencyFacilityType type,
  ) {
    switch (type) {
      case EmergencyFacilityType.hospital:
        return (
          icon: Icons.local_hospital,
          color: AppColors.alertRed,
          label: 'Hospital'
        );
      case EmergencyFacilityType.redCross:
        return (
          icon: Icons.bloodtype,
          color: Color(0xFFB91C1C),
          label: 'Red Cross'
        );
      case EmergencyFacilityType.drrmo:
        return (
          icon: Icons.shield,
          color: AppColors.successGreen,
          label: 'MDRRMO'
        );
      case EmergencyFacilityType.fireStation:
        return (
          icon: Icons.local_fire_department,
          color: AppColors.warningAmber,
          label: 'BFP'
        );
      case EmergencyFacilityType.police:
        return (
          icon: Icons.local_police,
          color: AppColors.responderBlue,
          label: 'Police'
        );
      case EmergencyFacilityType.ambulanceStation:
        return (
          icon: Icons.emergency,
          color: Color(0xFF7C3AED),
          label: 'Ambulance'
        );
    }
  }

  static String _formatDistance(double metres) => metres < 1000
      ? '${metres.round()} m'
      : '${(metres / 1000).toStringAsFixed(metres < 10000 ? 1 : 0)} km';

  @override
  Widget build(BuildContext context) {
    // The search box and its results sit above the map, so everything below
    // them shifts down in drop-off mode.
    final topInset = _isDropoff ? 74.0 : 12.0;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          if (_gpsBusy)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            )
          else
            IconButton(
              tooltip: 'My location',
              icon: const Icon(Icons.my_location),
              onPressed: () {
                setState(() => _gpsBusy = true);
                _locateMe();
              },
            ),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _center,
              initialZoom: 16,
              onMapEvent: _onMapEvent,
              onMapReady: () {
                if (_isDropoff) _loadFacilities();
              },
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.tanzalert.user',
              ),
              if (_isDropoff) MarkerLayer(markers: _facilityMarkers()),
            ],
          ),

          // Fixed center pin — lifts when dragging
          IgnorePointer(
            child: Align(
              alignment: Alignment.center,
              child: AnimatedPadding(
                duration: const Duration(milliseconds: 150),
                curve: Curves.easeOut,
                padding: EdgeInsets.only(bottom: _isDragging ? 24 : 0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.location_pin,
                      color: AppColors.alertRed,
                      size: 48,
                    ),
                    // Shadow dot that shrinks when pin lifts
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      width: _isDragging ? 8 : 14,
                      height: _isDragging ? 4 : 6,
                      decoration: BoxDecoration(
                        color: Colors.black26,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Coordinates pill
          Positioned(
            top: topInset,
            left: 16,
            right: 16,
            child: IgnorePointer(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: const [
                    BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, 2)),
                  ],
                ),
                child: Text(
                  '${_center.latitude.toStringAsFixed(6)},  ${_center.longitude.toStringAsFixed(6)}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: AppColors.textStrong,
                  ),
                ),
              ),
            ),
          ),

          if (_isDropoff) _searchOverlay(),

          // Bottom panel
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              color: Colors.white,
              padding: EdgeInsets.fromLTRB(
                16,
                16,
                16,
                16 + MediaQuery.of(context).padding.bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _isDropoff
                        ? 'Search for a facility, tap an icon on the map, or pan the map to any other address.'
                        : 'Pan the map to position the pin, or tap the GPS button to use your current location.',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textMuted,
                    ),
                  ),
                  if (_isDropoff) ...[
                    const SizedBox(height: 10),
                    _legend(),
                    if (_loadingFacilities || !_liveFacilitiesReached) ...[
                      const SizedBox(height: 8),
                      _facilityStatus(),
                    ],
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: _labelCtrl,
                    textCapitalization: TextCapitalization.words,
                    maxLines: 2,
                    minLines: 1,
                    // Typing claims the label; the pin stops overwriting it.
                    onChanged: (_) {
                      if (_labelFollowsPin) {
                        setState(() => _labelFollowsPin = false);
                      }
                    },
                    decoration: InputDecoration(
                      labelText: 'Location label',
                      hintText: _isDropoff
                          ? 'e.g. Tanza General Hospital'
                          : 'e.g. Home, Blk 4 Lot 12 Daang Amaya I',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      prefixIcon: const Icon(Icons.label_outline),
                      suffixIcon: _resolvingLabel
                          ? const Padding(
                              padding: EdgeInsets.all(12),
                              child: SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            )
                          : IconButton(
                              tooltip: 'Use the address under the pin',
                              icon: const Icon(Icons.refresh),
                              onPressed: () {
                                setState(() {
                                  _labelFollowsPin = true;
                                  _pinned = null;
                                });
                                _fillLabelFromPin(_center);
                              },
                            ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Map data © OpenStreetMap contributors',
                    style: TextStyle(fontSize: 10, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.check_circle),
                      label: const Text('Confirm Location'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.alertRed,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      onPressed: _confirm,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _searchOverlay() => Positioned(
        top: 12,
        left: 12,
        right: 12,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Material(
              elevation: 3,
              borderRadius: BorderRadius.circular(12),
              child: TextField(
                controller: _searchCtrl,
                focusNode: _searchFocus,
                textInputAction: TextInputAction.search,
                onChanged: _onSearchChanged,
                onSubmitted: _runSearch,
                decoration: InputDecoration(
                  hintText: 'Search "hospital near me", BFP, a place…',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searching
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : (_searchCtrl.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear search',
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchCtrl.clear();
                                _dismissSearch();
                              },
                            )),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            if (_hasSearchResults) _searchResults(),
          ],
        ),
      );

  Widget _searchResults() {
    final message = _searchEmptyMessage;
    return Container(
      margin: const EdgeInsets.only(top: 6),
      constraints: const BoxConstraints(maxHeight: 260),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 3)),
        ],
      ),
      child: message != null
          ? Padding(
              padding: const EdgeInsets.all(14),
              child: Text(
                message,
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            )
          : ListView(
              shrinkWrap: true,
              padding: EdgeInsets.zero,
              children: [
                if (_facilityHits.isNotEmpty) ...[
                  _resultsHeader(
                    _searchOrigin != null && _searchOrigin == _myLocation
                        ? 'Nearest to your location'
                        : 'Nearest to the map centre',
                  ),
                  ..._facilityHits.map(_facilityHitTile),
                ],
                if (_placeHits.isNotEmpty) ...[
                  _resultsHeader('Places'),
                  ..._placeHits.map(_placeHitTile),
                ],
              ],
            ),
    );
  }

  Widget _resultsHeader(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
        child: Text(
          text.toUpperCase(),
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.6,
            color: AppColors.textMuted,
          ),
        ),
      );

  Widget _facilityHitTile(EmergencyFacility f) {
    final style = _styleFor(f.type);
    final origin = _searchOrigin;
    final distance = origin == null
        ? null
        : const Distance().as(LengthUnit.Meter, origin, f.point);
    return InkWell(
      onTap: () => _selectFacility(f),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(color: style.color, shape: BoxShape.circle),
              child: Icon(style.icon, size: 16, color: Colors.white),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    f.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textStrong,
                    ),
                  ),
                  Text(
                    f.address ?? style.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            if (distance != null) ...[
              const SizedBox(width: 8),
              Text(
                _formatDistance(distance),
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: AppColors.responderBlue,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _placeHitTile(NominatimResult r) => InkWell(
        onTap: () => _selectPlace(r),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.place_outlined,
                  size: 18, color: AppColors.textMuted),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  r.displayName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      );

  /// Icon-only markers: no name plates on the map, so a dense town does not
  /// turn into overlapping text. The name arrives in the label on tap.
  ///
  /// The marker box is deliberately larger than the icon, because facilities
  /// sharing a compound are nudged apart within it ([facilityIconNudges]) and
  /// an icon drawn outside its own box would be clipped. Only the icon itself
  /// takes taps, so the slack does not swallow taps meant for a neighbour.
  List<Marker> _facilityMarkers() {
    const iconSize = 38.0;
    const boxSize = iconSize + 2 * _iconRingRadius;
    final nudges = facilityIconNudges(
      _facilities,
      ringRadiusPx: _iconRingRadius,
    );

    return _facilities.map((f) {
      final style = _styleFor(f.type);
      final selected = _pinned?.facilityId == f.id;
      final nudge = nudges[f.id] ?? (dx: 0.0, dy: 0.0);
      return Marker(
        point: f.point,
        width: boxSize,
        height: boxSize,
        child: Center(
          child: Transform.translate(
            offset: Offset(nudge.dx, nudge.dy),
            child: GestureDetector(
              onTap: () => _selectFacility(f),
              // Tooltip, not a map label: it only appears on a long press.
              child: Tooltip(
                message: f.name,
                child: Container(
                  width: iconSize,
                  height: iconSize,
                  decoration: BoxDecoration(
                    color: style.color,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: selected ? AppColors.textStrong : Colors.white,
                      width: selected ? 3 : 2,
                    ),
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
    }).toList();
  }

  static const double _iconRingRadius = 21;

  Widget _legend() => Wrap(
        spacing: 12,
        runSpacing: 6,
        children: EmergencyFacilityType.values.map((type) {
          final style = _styleFor(type);
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(color: style.color, shape: BoxShape.circle),
                child: Icon(style.icon, size: 10, color: Colors.white),
              ),
              const SizedBox(width: 4),
              Text(
                style.label,
                style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
              ),
            ],
          );
        }).toList(),
      );

  Widget _facilityStatus() {
    if (_loadingFacilities) {
      return const Row(
        children: [
          SizedBox(
            width: 12,
            height: 12,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: 8),
          Text(
            'Loading emergency facilities…',
            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
        ],
      );
    }
    // Seeds are still on the map, so this is a heads-up, not a failure.
    return const Row(
      children: [
        Icon(Icons.cloud_off, size: 13, color: AppColors.warningAmber),
        SizedBox(width: 6),
        Expanded(
          child: Text(
            'Showing saved facilities only — live map data is unreachable.',
            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
        ),
      ],
    );
  }
}
