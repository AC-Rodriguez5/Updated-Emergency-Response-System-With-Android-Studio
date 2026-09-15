import 'package:flutter_test/flutter_test.dart';
import 'package:safealert_mobile/safealert_mobile.dart';
void main() {
  test('configured API includes the API prefix', () {
    expect(Uri.parse(Api.defaultBase).path.endsWith('/api'), isTrue);
  });
}
