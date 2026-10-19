import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_user/features/emergency/models/emergency_model.dart';
import 'package:mobile_user/features/emergency/screens/active_emergency_screen.dart';

/// The tracking screen's timestamps come straight from the emergency's
/// timeline, so the parsing and the "when did X happen" lookups are what make
/// the difference between a real audit trail and a guess from the status field.
void main() {
  Map<String, dynamic> emergencyJson({List<Map<String, dynamic>>? timeline}) => {
    '_id': '68f3c1d2a4b5e6f708192a3b',
    'type': 'general_sos',
    'source': 'mobile_app',
    'priority': 'critical',
    'status': 'responder_on_the_way',
    'isInsideTanza': true,
    'outsideScopeFlag': false,
    'createdAt': '2026-10-19T04:00:00.000Z',
    'timeline': timeline,
  };

  group('timeline parsing', () {
    test('an emergency with no timeline parses to an empty one', () {
      final em = EmergencyModel.fromJson(emergencyJson());
      expect(em.timeline, isEmpty);
      expect(em.timeOf('created'), isNull);
      expect(em.arrivedAt, isNull);
      expect(em.userMessages, isEmpty);
    });

    test('events are parsed with their times, notes and roles', () {
      final em = EmergencyModel.fromJson(
        emergencyJson(
          timeline: [
            {
              'event': 'created',
              'at': '2026-10-19T04:00:00.000Z',
              'actorRole': 'user',
            },
            {
              'event': 'assigned',
              'at': '2026-10-19T04:02:30.000Z',
              'actorRole': 'admin',
            },
          ],
        ),
      );

      expect(em.timeline, hasLength(2));
      expect(em.timeline.first.event, 'created');
      expect(em.timeline.first.actorRole, 'user');
      expect(
        em.timeOf('assigned'),
        DateTime.parse('2026-10-19T04:02:30.000Z').toLocal(),
      );
    });

    test('timeOf returns the latest occurrence, not the first', () {
      // A responder can be reassigned; the useful timestamp is the one that
      // still applies.
      final em = EmergencyModel.fromJson(
        emergencyJson(
          timeline: [
            {'event': 'assigned', 'at': '2026-10-19T04:02:00.000Z'},
            {'event': 'assigned', 'at': '2026-10-19T04:20:00.000Z'},
          ],
        ),
      );

      expect(
        em.timeOf('assigned'),
        DateTime.parse('2026-10-19T04:20:00.000Z').toLocal(),
      );
    });

    test('a malformed entry does not take the whole timeline down', () {
      final em = EmergencyModel.fromJson(
        emergencyJson(
          timeline: [
            {'event': 'created', 'at': 'not-a-date'},
            {'event': 'assigned', 'at': '2026-10-19T04:02:00.000Z'},
          ],
        ),
      );

      expect(em.timeline, hasLength(2));
      expect(em.timeOf('assigned'), isNotNull);
    });

    test('a round trip through toJson keeps the timeline', () {
      final original = EmergencyModel.fromJson(
        emergencyJson(
          timeline: [
            {
              'event': 'user_message',
              'at': '2026-10-19T04:05:00.000Z',
              'note': 'Gate is locked',
              'actorRole': 'user',
            },
          ],
        ),
      );
      final restored = EmergencyModel.fromJson(original.toJson());

      expect(restored.userMessages, hasLength(1));
      expect(restored.userMessages.single.note, 'Gate is locked');
    });
  });

  group('arrivedAt', () {
    test('arrival is read from the responder report that carries it', () {
      // The backend pushes no "arrived" event: the responder files a
      // responder_report with reportType 'arrival'.
      final em = EmergencyModel.fromJson(
        emergencyJson(
          timeline: [
            {
              'event': 'responder_report',
              'at': '2026-10-19T04:09:00.000Z',
              'reportType': 'field_report',
              'note': 'Heavy traffic on the highway',
            },
            {
              'event': 'responder_report',
              'at': '2026-10-19T04:14:00.000Z',
              'reportType': 'arrival',
            },
          ],
        ),
      );

      expect(
        em.arrivedAt,
        DateTime.parse('2026-10-19T04:14:00.000Z').toLocal(),
      );
    });

    test('field reports alone do not count as having arrived', () {
      final em = EmergencyModel.fromJson(
        emergencyJson(
          timeline: [
            {
              'event': 'responder_report',
              'at': '2026-10-19T04:09:00.000Z',
              'reportType': 'field_report',
            },
          ],
        ),
      );

      expect(em.arrivedAt, isNull);
    });
  });

  group('userMessages', () {
    test('only the sender\'s own messages are collected, in order', () {
      final em = EmergencyModel.fromJson(
        emergencyJson(
          timeline: [
            {
              'event': 'user_message',
              'at': '2026-10-19T04:05:00.000Z',
              'note': 'Second floor',
            },
            {
              'event': 'admin_update_requested',
              'at': '2026-10-19T04:06:00.000Z',
              'note': 'Where is the unit?',
            },
            {
              'event': 'user_message',
              'at': '2026-10-19T04:07:00.000Z',
              'note': 'We moved to the roof',
            },
          ],
        ),
      );

      expect(em.userMessages.map((e) => e.note), [
        'Second floor',
        'We moved to the roof',
      ]);
      // The panel shows the last one, which must be the most recent.
      expect(em.userMessages.last.note, 'We moved to the roof');
    });
  });

  group('assigned responder', () {
    AssignedResponder? parse(Map<String, dynamic>? payload) =>
        EmergencyModel.fromJson({
          ...emergencyJson(),
          if (payload != null) 'assignedResponder': payload,
        }).assignedResponder;

    test('an unassigned emergency has no responder', () {
      expect(parse(null), isNull);
    });

    test('name, badge, agency and station are parsed', () {
      final r = parse({
        'id': '68f3c1d2a4b5e6f708192a40',
        'name': 'SFO1 Rommel Hernandez',
        'badgeId': 'MDRRMO-014',
        'agency': 'MDRRMO',
        'department': 'rescue',
        'stationName': 'Tanza Municipal Station',
      })!;

      expect(r.name, 'SFO1 Rommel Hernandez');
      expect(r.badgeId, 'MDRRMO-014');
      expect(r.unitLine, 'MDRRMO - Tanza Municipal Station');
    });

    test('a responder with no station still names their agency', () {
      final r = parse({'id': 'x', 'name': 'J. Catibog', 'agency': 'BFP'})!;
      expect(r.unitLine, 'BFP');
    });

    test('a responder with neither agency nor station has an empty unit line',
        () {
      // The panel then falls back to the status sentence rather than printing
      // a stray separator.
      final r = parse({'id': 'x', 'name': 'J. Catibog'})!;
      expect(r.unitLine, isEmpty);
    });

    test('no contact details are carried, even if the API ever sends them', () {
      final r = parse({
        'id': 'x',
        'name': 'J. Catibog',
        'phone': '09171234567',
        'email': 'responder@example.com',
      })!;
      expect(r.toJson().containsKey('phone'), isFalse);
      expect(r.toJson().containsKey('email'), isFalse);
    });

    test('a round trip through toJson keeps the responder', () {
      final original = EmergencyModel.fromJson({
        ...emergencyJson(),
        'assignedResponder': {
          'id': 'r1',
          'name': 'SFO1 Rommel Hernandez',
          'agency': 'MDRRMO',
          'stationName': 'Tanza Municipal Station',
        },
      });
      final restored = EmergencyModel.fromJson(original.toJson());
      expect(
        restored.assignedResponder?.unitLine,
        'MDRRMO - Tanza Municipal Station',
      );
    });
  });

  group('clock formatting', () {
    test('midnight and noon do not read as zero o-clock', () {
      expect(ActiveEmergencyTime.clock(DateTime(2026, 10, 19, 0, 7)), '12:07 AM');
      expect(ActiveEmergencyTime.clock(DateTime(2026, 10, 19, 12, 0)), '12:00 PM');
    });

    test('minutes keep a leading zero', () {
      expect(ActiveEmergencyTime.clock(DateTime(2026, 10, 19, 9, 5)), '9:05 AM');
      expect(ActiveEmergencyTime.clock(DateTime(2026, 10, 19, 21, 45)), '9:45 PM');
    });
  });
}
