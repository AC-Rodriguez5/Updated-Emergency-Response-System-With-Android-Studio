import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/config/app_config.dart';
import '../../../core/theme/app_colors.dart';
import '../models/picked_location.dart';
import '../services/nominatim_service.dart';

enum LocationPickerMode { pickup, dropoff }

class LocationPickerScreen extends StatefulWidget {
  final LocationPickerMode mode;
  final PickedLocation? initial;

  const LocationPickerScreen({super.key, required this.mode, this.initial});

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  final MapController _mapController = MapController();
  final TextEditingController _searchCtrl = TextEditingController();
  final NominatimService _nominatim = NominatimService();

  LatLng? _selected;
  String _address = '';
  bool _resolvingAddress = false;
  bool _gettingCurrent = false;
  String? _error;

  Timer? _searchDebounce;
  List<NominatimResult> _results = const [];
  bool _searching = false;

  bool get _isPickup => widget.mode == LocationPickerMode.pickup;

  @override
  void initState() {
    super.initState();
    final init = widget.initial;
    if (init != null) {
      _selected = LatLng(init.latitude, init.longitude);
      _address = init.address;
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  Future<void> _useCurrentLocation() async {
    setState(() {
      _gettingCurrent = true;
      _error = null;
    });
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        setState(() => _error = 'Location permission denied. Enable in settings.');
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 12),
        ),
      );
      final point = LatLng(pos.latitude, pos.longitude);
      _setSelected(point, animateTo: true);
    } catch (_) {
      setState(() => _error = 'Could not get current location. Try the map or search.');
    } finally {
      if (mounted) setState(() => _gettingCurrent = false);
    }
  }

  void _setSelected(LatLng point, {bool animateTo = false}) {
    setState(() {
      _selected = point;
      _address = '';
    });
    if (animateTo) {
      _mapController.move(point, 16);
    }
    _resolveAddress(point);
  }

  Future<void> _resolveAddress(LatLng point) async {
    setState(() => _resolvingAddress = true);
    String? label;
    try {
      final placemarks = await Geocoding().placemarkFromCoordinates(
        point.latitude,
        point.longitude,
      );
      if (placemarks.isNotEmpty) {
        final p = placemarks.first;
        label = [
          if ((p.name ?? '').isNotEmpty && p.name != p.thoroughfare) p.name,
          if ((p.thoroughfare ?? '').isNotEmpty) p.thoroughfare,
          if ((p.subLocality ?? '').isNotEmpty) p.subLocality,
          if ((p.locality ?? '').isNotEmpty) p.locality,
          if ((p.administrativeArea ?? '').isNotEmpty) p.administrativeArea,
        ].whereType<String>().where((s) => s.isNotEmpty).join(', ');
      }
    } catch (_) {
      // fall through to coords-only label
    }
    if (!mounted) return;
    setState(() {
      _address = (label != null && label.trim().isNotEmpty)
          ? label
          : '${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)}';
      _resolvingAddress = false;
    });
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    if (value.trim().isEmpty) {
      setState(() => _results = const []);
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _searching = true);
      final results = await _nominatim.search(value);
      if (!mounted) return;
      setState(() {
        _results = results;
        _searching = false;
      });
    });
  }

  void _selectResult(NominatimResult r) {
    final point = LatLng(r.latitude, r.longitude);
    _searchCtrl.text = r.displayName;
    setState(() {
      _selected = point;
      _address = r.displayName;
      _results = const [];
    });
    _mapController.move(point, 16);
  }

  void _confirm() {
    if (_selected == null) return;
    final result = PickedLocation(
      latitude: _selected!.latitude,
      longitude: _selected!.longitude,
      address: _address.isEmpty
          ? '${_selected!.latitude.toStringAsFixed(5)}, ${_selected!.longitude.toStringAsFixed(5)}'
          : _address,
    );
    Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    final title = _isPickup ? 'Pickup Location' : 'Drop-off Location';
    final initialCenter = _selected ??
        LatLng(AppConfig.tanzaCenterLat, AppConfig.tanzaCenterLng);

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Column(
        children: [
          if (!_isPickup)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: Column(
                children: [
                  TextField(
                    controller: _searchCtrl,
                    onChanged: _onSearchChanged,
                    decoration: InputDecoration(
                      hintText: 'Search hospital, place, or address',
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
                          : (_searchCtrl.text.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(Icons.clear),
                                  onPressed: () {
                                    _searchCtrl.clear();
                                    setState(() => _results = const []);
                                  },
                                )
                              : null),
                      filled: true,
                      fillColor: AppColors.surface,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  if (_results.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Column(
                        children: _results
                            .map((r) => InkWell(
                                  onTap: () => _selectResult(r),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 14, vertical: 10),
                                    child: Row(
                                      children: [
                                        const Icon(Icons.place_outlined,
                                            size: 18, color: AppColors.textMuted),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Text(
                                            r.displayName,
                                            style: const TextStyle(fontSize: 13),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ))
                            .toList(),
                      ),
                    ),
                ],
              ),
            ),
          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: initialCenter,
                    initialZoom: 14,
                    onTap: (_, point) => _setSelected(point),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.tanzalert.app',
                    ),
                    if (_selected != null)
                      MarkerLayer(markers: [
                        Marker(
                          point: _selected!,
                          width: 40,
                          height: 40,
                          alignment: Alignment.topCenter,
                          child: Icon(
                            Icons.location_on,
                            size: 40,
                            color: _isPickup ? AppColors.alertRed : AppColors.responderBlue,
                          ),
                        ),
                      ]),
                  ],
                ),
                if (_isPickup)
                  Positioned(
                    top: 12,
                    left: 12,
                    right: 12,
                    child: ElevatedButton.icon(
                      onPressed: _gettingCurrent ? null : _useCurrentLocation,
                      icon: _gettingCurrent
                          ? const SizedBox(
                              width: 16, height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.my_location),
                      label: Text(_gettingCurrent ? 'Locating…' : 'Use Current Location'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.alertRed,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(44),
                      ),
                    ),
                  ),
                Positioned(
                  bottom: 12, left: 12, right: 12,
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: const [
                        BoxShadow(blurRadius: 12, color: Colors.black12, offset: Offset(0, 4)),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.place,
                              color: _isPickup ? AppColors.alertRed : AppColors.responderBlue,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _selected == null
                                  ? const Text('Tap the map to choose a location.',
                                      style: TextStyle(color: AppColors.textMuted))
                                  : (_resolvingAddress
                                      ? const Text('Resolving address…',
                                          style: TextStyle(color: AppColors.textMuted))
                                      : Text(
                                          _address,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontSize: 13),
                                        )),
                            ),
                          ],
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 8),
                          Text(_error!, style: const TextStyle(color: AppColors.alertRed, fontSize: 12)),
                        ],
                        const SizedBox(height: 12),
                        ElevatedButton(
                          onPressed: _selected == null ? null : _confirm,
                          style: ElevatedButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                            backgroundColor: AppColors.alertRed,
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Confirm Location'),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
