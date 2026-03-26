export function encodeFeedMessage(message) {
  let bb = popByteBuffer();
  _encodeFeedMessage(message, bb);
  return toUint8Array(bb);
}

function _encodeFeedMessage(message, bb) {
  // required FeedHeader header = 1;
  let $header = message.header;
  if ($header !== undefined) {
    writeVarint32(bb, 10);
    let nested = popByteBuffer();
    _encodeFeedHeader($header, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // repeated FeedEntity entity = 2;
  let array$entity = message.entity;
  if (array$entity !== undefined) {
    for (let value of array$entity) {
      writeVarint32(bb, 18);
      let nested = popByteBuffer();
      _encodeFeedEntity(value, nested);
      writeVarint32(bb, nested.limit);
      writeByteBuffer(bb, nested);
      pushByteBuffer(nested);
    }
  }
}

export function decodeFeedMessage(binary) {
  return _decodeFeedMessage(wrapByteBuffer(binary));
}

function _decodeFeedMessage(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // required FeedHeader header = 1;
      case 1: {
        let limit = pushTemporaryLength(bb);
        message.header = _decodeFeedHeader(bb);
        bb.limit = limit;
        break;
      }

      // repeated FeedEntity entity = 2;
      case 2: {
        let limit = pushTemporaryLength(bb);
        let values = message.entity || (message.entity = []);
        values.push(_decodeFeedEntity(bb));
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  if (message.header === undefined)
    throw new Error("Missing required field: header");

  return message;
}

export function encodeFeedHeader(message) {
  let bb = popByteBuffer();
  _encodeFeedHeader(message, bb);
  return toUint8Array(bb);
}

function _encodeFeedHeader(message, bb) {
  // required string gtfs_realtime_version = 1;
  let $gtfs_realtime_version = message.gtfs_realtime_version;
  if ($gtfs_realtime_version !== undefined) {
    writeVarint32(bb, 10);
    writeString(bb, $gtfs_realtime_version);
  }

  // optional uint64 timestamp = 5;
  let $timestamp = message.timestamp;
  if ($timestamp !== undefined) {
    writeVarint32(bb, 40);
    writeVarint64(bb, $timestamp);
  }
}

export function decodeFeedHeader(binary) {
  return _decodeFeedHeader(wrapByteBuffer(binary));
}

function _decodeFeedHeader(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // required string gtfs_realtime_version = 1;
      case 1: {
        message.gtfs_realtime_version = readString(bb, readVarint32(bb));
        break;
      }

      // optional uint64 timestamp = 5;
      case 5: {
        message.timestamp = readVarint64(bb, /* unsigned */ true);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  if (message.gtfs_realtime_version === undefined)
    throw new Error("Missing required field: gtfs_realtime_version");

  return message;
}

export function encodeFeedEntity(message) {
  let bb = popByteBuffer();
  _encodeFeedEntity(message, bb);
  return toUint8Array(bb);
}

function _encodeFeedEntity(message, bb) {
  // required string id = 1;
  let $id = message.id;
  if ($id !== undefined) {
    writeVarint32(bb, 10);
    writeString(bb, $id);
  }

  // optional TripUpdate trip_update = 3;
  let $trip_update = message.trip_update;
  if ($trip_update !== undefined) {
    writeVarint32(bb, 26);
    let nested = popByteBuffer();
    _encodeTripUpdate($trip_update, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // optional VehiclePosition vehicle = 4;
  let $vehicle = message.vehicle;
  if ($vehicle !== undefined) {
    writeVarint32(bb, 34);
    let nested = popByteBuffer();
    _encodeVehiclePosition($vehicle, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // optional Alert alert = 5;
  let $alert = message.alert;
  if ($alert !== undefined) {
    writeVarint32(bb, 42);
    let nested = popByteBuffer();
    _encodeAlert($alert, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }
}

export function decodeFeedEntity(binary) {
  return _decodeFeedEntity(wrapByteBuffer(binary));
}

function _decodeFeedEntity(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // required string id = 1;
      case 1: {
        message.id = readString(bb, readVarint32(bb));
        break;
      }

      // optional TripUpdate trip_update = 3;
      case 3: {
        let limit = pushTemporaryLength(bb);
        message.trip_update = _decodeTripUpdate(bb);
        bb.limit = limit;
        break;
      }

      // optional VehiclePosition vehicle = 4;
      case 4: {
        let limit = pushTemporaryLength(bb);
        message.vehicle = _decodeVehiclePosition(bb);
        bb.limit = limit;
        break;
      }

      // optional Alert alert = 5;
      case 5: {
        let limit = pushTemporaryLength(bb);
        message.alert = _decodeAlert(bb);
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  if (message.id === undefined)
    throw new Error("Missing required field: id");

  return message;
}

export function encodeTripUpdate(message) {
  let bb = popByteBuffer();
  _encodeTripUpdate(message, bb);
  return toUint8Array(bb);
}

function _encodeTripUpdate(message, bb) {
  // optional TripDescriptor trip = 1;
  let $trip = message.trip;
  if ($trip !== undefined) {
    writeVarint32(bb, 10);
    let nested = popByteBuffer();
    _encodeTripDescriptor($trip, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // optional VehicleDescriptor vehicle = 3;
  let $vehicle = message.vehicle;
  if ($vehicle !== undefined) {
    writeVarint32(bb, 26);
    let nested = popByteBuffer();
    _encodeVehicleDescriptor($vehicle, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // repeated StopTimeUpdate stop_time_update = 2;
  let array$stop_time_update = message.stop_time_update;
  if (array$stop_time_update !== undefined) {
    for (let value of array$stop_time_update) {
      writeVarint32(bb, 18);
      let nested = popByteBuffer();
      _encodeStopTimeUpdate(value, nested);
      writeVarint32(bb, nested.limit);
      writeByteBuffer(bb, nested);
      pushByteBuffer(nested);
    }
  }

  // optional uint64 timestamp = 4;
  let $timestamp = message.timestamp;
  if ($timestamp !== undefined) {
    writeVarint32(bb, 32);
    writeVarint64(bb, $timestamp);
  }
}

export function decodeTripUpdate(binary) {
  return _decodeTripUpdate(wrapByteBuffer(binary));
}

function _decodeTripUpdate(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional TripDescriptor trip = 1;
      case 1: {
        let limit = pushTemporaryLength(bb);
        message.trip = _decodeTripDescriptor(bb);
        bb.limit = limit;
        break;
      }

      // optional VehicleDescriptor vehicle = 3;
      case 3: {
        let limit = pushTemporaryLength(bb);
        message.vehicle = _decodeVehicleDescriptor(bb);
        bb.limit = limit;
        break;
      }

      // repeated StopTimeUpdate stop_time_update = 2;
      case 2: {
        let limit = pushTemporaryLength(bb);
        let values = message.stop_time_update || (message.stop_time_update = []);
        values.push(_decodeStopTimeUpdate(bb));
        bb.limit = limit;
        break;
      }

      // optional uint64 timestamp = 4;
      case 4: {
        message.timestamp = readVarint64(bb, /* unsigned */ true);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export function encodeStopTimeEvent(message) {
  let bb = popByteBuffer();
  _encodeStopTimeEvent(message, bb);
  return toUint8Array(bb);
}

function _encodeStopTimeEvent(message, bb) {
  // optional int32 delay = 1;
  let $delay = message.delay;
  if ($delay !== undefined) {
    writeVarint32(bb, 8);
    writeVarint64(bb, intToLong($delay));
  }

  // optional int64 time = 2;
  let $time = message.time;
  if ($time !== undefined) {
    writeVarint32(bb, 16);
    writeVarint64(bb, $time);
  }
}

export function decodeStopTimeEvent(binary) {
  return _decodeStopTimeEvent(wrapByteBuffer(binary));
}

function _decodeStopTimeEvent(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional int32 delay = 1;
      case 1: {
        message.delay = readVarint32(bb);
        break;
      }

      // optional int64 time = 2;
      case 2: {
        message.time = readVarint64(bb, /* unsigned */ false);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export function encodeVehiclePosition(message) {
  let bb = popByteBuffer();
  _encodeVehiclePosition(message, bb);
  return toUint8Array(bb);
}

function _encodeVehiclePosition(message, bb) {
  // optional TripDescriptor trip = 1;
  let $trip = message.trip;
  if ($trip !== undefined) {
    writeVarint32(bb, 10);
    let nested = popByteBuffer();
    _encodeTripDescriptor($trip, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // optional VehicleDescriptor vehicle = 8;
  let $vehicle = message.vehicle;
  if ($vehicle !== undefined) {
    writeVarint32(bb, 66);
    let nested = popByteBuffer();
    _encodeVehicleDescriptor($vehicle, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // optional Position position = 2;
  let $position = message.position;
  if ($position !== undefined) {
    writeVarint32(bb, 18);
    let nested = popByteBuffer();
    _encodePosition($position, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // optional uint64 timestamp = 5;
  let $timestamp = message.timestamp;
  if ($timestamp !== undefined) {
    writeVarint32(bb, 40);
    writeVarint64(bb, $timestamp);
  }
}

export function decodeVehiclePosition(binary) {
  return _decodeVehiclePosition(wrapByteBuffer(binary));
}

function _decodeVehiclePosition(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional TripDescriptor trip = 1;
      case 1: {
        let limit = pushTemporaryLength(bb);
        message.trip = _decodeTripDescriptor(bb);
        bb.limit = limit;
        break;
      }

      // optional VehicleDescriptor vehicle = 8;
      case 8: {
        let limit = pushTemporaryLength(bb);
        message.vehicle = _decodeVehicleDescriptor(bb);
        bb.limit = limit;
        break;
      }

      // optional Position position = 2;
      case 2: {
        let limit = pushTemporaryLength(bb);
        message.position = _decodePosition(bb);
        bb.limit = limit;
        break;
      }

      // optional uint64 timestamp = 5;
      case 5: {
        message.timestamp = readVarint64(bb, /* unsigned */ true);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export function encodePosition(message) {
  let bb = popByteBuffer();
  _encodePosition(message, bb);
  return toUint8Array(bb);
}

function _encodePosition(message, bb) {
  // required float latitude = 1;
  let $latitude = message.latitude;
  if ($latitude !== undefined) {
    writeVarint32(bb, 13);
    writeFloat(bb, $latitude);
  }

  // required float longitude = 2;
  let $longitude = message.longitude;
  if ($longitude !== undefined) {
    writeVarint32(bb, 21);
    writeFloat(bb, $longitude);
  }

  // optional float bearing = 3;
  let $bearing = message.bearing;
  if ($bearing !== undefined) {
    writeVarint32(bb, 29);
    writeFloat(bb, $bearing);
  }

  // optional float speed = 5;
  let $speed = message.speed;
  if ($speed !== undefined) {
    writeVarint32(bb, 45);
    writeFloat(bb, $speed);
  }
}

export function decodePosition(binary) {
  return _decodePosition(wrapByteBuffer(binary));
}

function _decodePosition(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // required float latitude = 1;
      case 1: {
        message.latitude = readFloat(bb);
        break;
      }

      // required float longitude = 2;
      case 2: {
        message.longitude = readFloat(bb);
        break;
      }

      // optional float bearing = 3;
      case 3: {
        message.bearing = readFloat(bb);
        break;
      }

      // optional float speed = 5;
      case 5: {
        message.speed = readFloat(bb);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  if (message.latitude === undefined)
    throw new Error("Missing required field: latitude");

  if (message.longitude === undefined)
    throw new Error("Missing required field: longitude");

  return message;
}

export function encodeAlert(message) {
  let bb = popByteBuffer();
  _encodeAlert(message, bb);
  return toUint8Array(bb);
}

function _encodeAlert(message, bb) {
  // repeated TimeRange active_period = 1;
  let array$active_period = message.active_period;
  if (array$active_period !== undefined) {
    for (let value of array$active_period) {
      writeVarint32(bb, 10);
      let nested = popByteBuffer();
      _encodeTimeRange(value, nested);
      writeVarint32(bb, nested.limit);
      writeByteBuffer(bb, nested);
      pushByteBuffer(nested);
    }
  }

  // repeated EntitySelector informed_entity = 5;
  let array$informed_entity = message.informed_entity;
  if (array$informed_entity !== undefined) {
    for (let value of array$informed_entity) {
      writeVarint32(bb, 42);
      let nested = popByteBuffer();
      _encodeEntitySelector(value, nested);
      writeVarint32(bb, nested.limit);
      writeByteBuffer(bb, nested);
      pushByteBuffer(nested);
    }
  }

  // optional TranslatedString header_text = 10;
  let $header_text = message.header_text;
  if ($header_text !== undefined) {
    writeVarint32(bb, 82);
    let nested = popByteBuffer();
    _encodeTranslatedString($header_text, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // optional TranslatedString description_text = 11;
  let $description_text = message.description_text;
  if ($description_text !== undefined) {
    writeVarint32(bb, 90);
    let nested = popByteBuffer();
    _encodeTranslatedString($description_text, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }

  // optional TranslatedString url = 8;
  let $url = message.url;
  if ($url !== undefined) {
    writeVarint32(bb, 66);
    let nested = popByteBuffer();
    _encodeTranslatedString($url, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }
}

export function decodeAlert(binary) {
  return _decodeAlert(wrapByteBuffer(binary));
}

function _decodeAlert(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // repeated TimeRange active_period = 1;
      case 1: {
        let limit = pushTemporaryLength(bb);
        let values = message.active_period || (message.active_period = []);
        values.push(_decodeTimeRange(bb));
        bb.limit = limit;
        break;
      }

      // repeated EntitySelector informed_entity = 5;
      case 5: {
        let limit = pushTemporaryLength(bb);
        let values = message.informed_entity || (message.informed_entity = []);
        values.push(_decodeEntitySelector(bb));
        bb.limit = limit;
        break;
      }

      // optional TranslatedString header_text = 10;
      case 10: {
        let limit = pushTemporaryLength(bb);
        message.header_text = _decodeTranslatedString(bb);
        bb.limit = limit;
        break;
      }

      // optional TranslatedString description_text = 11;
      case 11: {
        let limit = pushTemporaryLength(bb);
        message.description_text = _decodeTranslatedString(bb);
        bb.limit = limit;
        break;
      }

      // optional TranslatedString url = 8;
      case 8: {
        let limit = pushTemporaryLength(bb);
        message.url = _decodeTranslatedString(bb);
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export function encodeTimeRange(message) {
  let bb = popByteBuffer();
  _encodeTimeRange(message, bb);
  return toUint8Array(bb);
}

function _encodeTimeRange(message, bb) {
  // optional uint64 start = 1;
  let $start = message.start;
  if ($start !== undefined) {
    writeVarint32(bb, 8);
    writeVarint64(bb, $start);
  }

  // optional uint64 end = 2;
  let $end = message.end;
  if ($end !== undefined) {
    writeVarint32(bb, 16);
    writeVarint64(bb, $end);
  }
}

export function decodeTimeRange(binary) {
  return _decodeTimeRange(wrapByteBuffer(binary));
}

function _decodeTimeRange(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional uint64 start = 1;
      case 1: {
        message.start = readVarint64(bb, /* unsigned */ true);
        break;
      }

      // optional uint64 end = 2;
      case 2: {
        message.end = readVarint64(bb, /* unsigned */ true);
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export function encodeEntitySelector(message) {
  let bb = popByteBuffer();
  _encodeEntitySelector(message, bb);
  return toUint8Array(bb);
}

function _encodeEntitySelector(message, bb) {
  // optional string agency_id = 1;
  let $agency_id = message.agency_id;
  if ($agency_id !== undefined) {
    writeVarint32(bb, 10);
    writeString(bb, $agency_id);
  }

  // optional string route_id = 2;
  let $route_id = message.route_id;
  if ($route_id !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $route_id);
  }

  // optional string stop_id = 6;
  let $stop_id = message.stop_id;
  if ($stop_id !== undefined) {
    writeVarint32(bb, 50);
    writeString(bb, $stop_id);
  }

  // optional TripDescriptor trip = 3;
  let $trip = message.trip;
  if ($trip !== undefined) {
    writeVarint32(bb, 26);
    let nested = popByteBuffer();
    _encodeTripDescriptor($trip, nested);
    writeVarint32(bb, nested.limit);
    writeByteBuffer(bb, nested);
    pushByteBuffer(nested);
  }
}

export function decodeEntitySelector(binary) {
  return _decodeEntitySelector(wrapByteBuffer(binary));
}

function _decodeEntitySelector(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional string agency_id = 1;
      case 1: {
        message.agency_id = readString(bb, readVarint32(bb));
        break;
      }

      // optional string route_id = 2;
      case 2: {
        message.route_id = readString(bb, readVarint32(bb));
        break;
      }

      // optional string stop_id = 6;
      case 6: {
        message.stop_id = readString(bb, readVarint32(bb));
        break;
      }

      // optional TripDescriptor trip = 3;
      case 3: {
        let limit = pushTemporaryLength(bb);
        message.trip = _decodeTripDescriptor(bb);
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export function encodeTripDescriptor(message) {
  let bb = popByteBuffer();
  _encodeTripDescriptor(message, bb);
  return toUint8Array(bb);
}

function _encodeTripDescriptor(message, bb) {
  // optional string trip_id = 1;
  let $trip_id = message.trip_id;
  if ($trip_id !== undefined) {
    writeVarint32(bb, 10);
    writeString(bb, $trip_id);
  }

  // optional string route_id = 5;
  let $route_id = message.route_id;
  if ($route_id !== undefined) {
    writeVarint32(bb, 42);
    writeString(bb, $route_id);
  }

  // optional string start_time = 2;
  let $start_time = message.start_time;
  if ($start_time !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $start_time);
  }

  // optional string start_date = 3;
  let $start_date = message.start_date;
  if ($start_date !== undefined) {
    writeVarint32(bb, 26);
    writeString(bb, $start_date);
  }

  // optional uint32 direction_id = 6;
  let $direction_id = message.direction_id;
  if ($direction_id !== undefined) {
    writeVarint32(bb, 48);
    writeVarint32(bb, $direction_id);
  }
}

export function decodeTripDescriptor(binary) {
  return _decodeTripDescriptor(wrapByteBuffer(binary));
}

function _decodeTripDescriptor(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional string trip_id = 1;
      case 1: {
        message.trip_id = readString(bb, readVarint32(bb));
        break;
      }

      // optional string route_id = 5;
      case 5: {
        message.route_id = readString(bb, readVarint32(bb));
        break;
      }

      // optional string start_time = 2;
      case 2: {
        message.start_time = readString(bb, readVarint32(bb));
        break;
      }

      // optional string start_date = 3;
      case 3: {
        message.start_date = readString(bb, readVarint32(bb));
        break;
      }

      // optional uint32 direction_id = 6;
      case 6: {
        message.direction_id = readVarint32(bb) >>> 0;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export function encodeVehicleDescriptor(message) {
  let bb = popByteBuffer();
  _encodeVehicleDescriptor(message, bb);
  return toUint8Array(bb);
}

function _encodeVehicleDescriptor(message, bb) {
  // optional string id = 1;
  let $id = message.id;
  if ($id !== undefined) {
    writeVarint32(bb, 10);
    writeString(bb, $id);
  }

  // optional string label = 2;
  let $label = message.label;
  if ($label !== undefined) {
    writeVarint32(bb, 18);
    writeString(bb, $label);
  }

  // optional string license_plate = 3;
  let $license_plate = message.license_plate;
  if ($license_plate !== undefined) {
    writeVarint32(bb, 26);
    writeString(bb, $license_plate);
  }
}

export function decodeVehicleDescriptor(binary) {
  return _decodeVehicleDescriptor(wrapByteBuffer(binary));
}

function _decodeVehicleDescriptor(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // optional string id = 1;
      case 1: {
        message.id = readString(bb, readVarint32(bb));
        break;
      }

      // optional string label = 2;
      case 2: {
        message.label = readString(bb, readVarint32(bb));
        break;
      }

      // optional string license_plate = 3;
      case 3: {
        message.license_plate = readString(bb, readVarint32(bb));
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

export function encodeTranslatedString(message) {
  let bb = popByteBuffer();
  _encodeTranslatedString(message, bb);
  return toUint8Array(bb);
}

function _encodeTranslatedString(message, bb) {
  // repeated Translation translation = 1;
  let array$translation = message.translation;
  if (array$translation !== undefined) {
    for (let value of array$translation) {
      writeVarint32(bb, 10);
      let nested = popByteBuffer();
      _encodeTranslation(value, nested);
      writeVarint32(bb, nested.limit);
      writeByteBuffer(bb, nested);
      pushByteBuffer(nested);
    }
  }
}

export function decodeTranslatedString(binary) {
  return _decodeTranslatedString(wrapByteBuffer(binary));
}

function _decodeTranslatedString(bb) {
  let message = {};

  end_of_message: while (!isAtEnd(bb)) {
    let tag = readVarint32(bb);

    switch (tag >>> 3) {
      case 0:
        break end_of_message;

      // repeated Translation translation = 1;
      case 1: {
        let limit = pushTemporaryLength(bb);
        let values = message.translation || (message.translation = []);
        values.push(_decodeTranslation(bb));
        bb.limit = limit;
        break;
      }

      default:
        skipUnknownField(bb, tag & 7);
    }
  }

  return message;
}

function pushTemporaryLength(bb) {
  let length = readVarint32(bb);
  let limit = bb.limit;
  bb.limit = bb.offset + length;
  return limit;
}

function skipUnknownField(bb, type) {
  switch (type) {
    case 0: while (readByte(bb) & 0x80) { } break;
    case 2: skip(bb, readVarint32(bb)); break;
    case 5: skip(bb, 4); break;
    case 1: skip(bb, 8); break;
    default: throw new Error("Unimplemented type: " + type);
  }
}

function stringToLong(value) {
  return {
    low: value.charCodeAt(0) | (value.charCodeAt(1) << 16),
    high: value.charCodeAt(2) | (value.charCodeAt(3) << 16),
    unsigned: false,
  };
}

function longToString(value) {
  let low = value.low;
  let high = value.high;
  return String.fromCharCode(
    low & 0xFFFF,
    low >>> 16,
    high & 0xFFFF,
    high >>> 16);
}

// The code below was modified from https://github.com/protobufjs/bytebuffer.js
// which is under the Apache License 2.0.

let f32 = new Float32Array(1);
let f32_u8 = new Uint8Array(f32.buffer);

let f64 = new Float64Array(1);
let f64_u8 = new Uint8Array(f64.buffer);

function intToLong(value) {
  value |= 0;
  return {
    low: value,
    high: value >> 31,
    unsigned: value >= 0,
  };
}

let bbStack = [];

function popByteBuffer() {
  const bb = bbStack.pop();
  if (!bb) return { bytes: new Uint8Array(64), offset: 0, limit: 0 };
  bb.offset = bb.limit = 0;
  return bb;
}

function pushByteBuffer(bb) {
  bbStack.push(bb);
}

function wrapByteBuffer(bytes) {
  return { bytes, offset: 0, limit: bytes.length };
}

function toUint8Array(bb) {
  let bytes = bb.bytes;
  let limit = bb.limit;
  return bytes.length === limit ? bytes : bytes.subarray(0, limit);
}

function skip(bb, offset) {
  if (bb.offset + offset > bb.limit) {
    throw new Error('Skip past limit');
  }
  bb.offset += offset;
}

function isAtEnd(bb) {
  return bb.offset >= bb.limit;
}

function grow(bb, count) {
  let bytes = bb.bytes;
  let offset = bb.offset;
  let limit = bb.limit;
  let finalOffset = offset + count;
  if (finalOffset > bytes.length) {
    let newBytes = new Uint8Array(finalOffset * 2);
    newBytes.set(bytes);
    bb.bytes = newBytes;
  }
  bb.offset = finalOffset;
  if (finalOffset > limit) {
    bb.limit = finalOffset;
  }
  return offset;
}

function advance(bb, count) {
  let offset = bb.offset;
  if (offset + count > bb.limit) {
    throw new Error('Read past limit');
  }
  bb.offset += count;
  return offset;
}

function readBytes(bb, count) {
  let offset = advance(bb, count);
  return bb.bytes.subarray(offset, offset + count);
}

function writeBytes(bb, buffer) {
  let offset = grow(bb, buffer.length);
  bb.bytes.set(buffer, offset);
}

function readString(bb, count) {
  // Sadly a hand-coded UTF8 decoder is much faster than subarray+TextDecoder in V8
  let offset = advance(bb, count);
  let fromCharCode = String.fromCharCode;
  let bytes = bb.bytes;
  let invalid = '\uFFFD';
  let text = '';

  for (let i = 0; i < count; i++) {
    let c1 = bytes[i + offset], c2, c3, c4, c;

    // 1 byte
    if ((c1 & 0x80) === 0) {
      text += fromCharCode(c1);
    }

    // 2 bytes
    else if ((c1 & 0xE0) === 0xC0) {
      if (i + 1 >= count) text += invalid;
      else {
        c2 = bytes[i + offset + 1];
        if ((c2 & 0xC0) !== 0x80) text += invalid;
        else {
          c = ((c1 & 0x1F) << 6) | (c2 & 0x3F);
          if (c < 0x80) text += invalid;
          else {
            text += fromCharCode(c);
            i++;
          }
        }
      }
    }

    // 3 bytes
    else if ((c1 & 0xF0) == 0xE0) {
      if (i + 2 >= count) text += invalid;
      else {
        c2 = bytes[i + offset + 1];
        c3 = bytes[i + offset + 2];
        if (((c2 | (c3 << 8)) & 0xC0C0) !== 0x8080) text += invalid;
        else {
          c = ((c1 & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F);
          if (c < 0x0800 || (c >= 0xD800 && c <= 0xDFFF)) text += invalid;
          else {
            text += fromCharCode(c);
            i += 2;
          }
        }
      }
    }

    // 4 bytes
    else if ((c1 & 0xF8) == 0xF0) {
      if (i + 3 >= count) text += invalid;
      else {
        c2 = bytes[i + offset + 1];
        c3 = bytes[i + offset + 2];
        c4 = bytes[i + offset + 3];
        if (((c2 | (c3 << 8) | (c4 << 16)) & 0xC0C0C0) !== 0x808080) text += invalid;
        else {
          c = ((c1 & 0x07) << 0x12) | ((c2 & 0x3F) << 0x0C) | ((c3 & 0x3F) << 0x06) | (c4 & 0x3F);
          if (c < 0x10000 || c > 0x10FFFF) text += invalid;
          else {
            c -= 0x10000;
            text += fromCharCode((c >> 10) + 0xD800, (c & 0x3FF) + 0xDC00);
            i += 3;
          }
        }
      }
    }

    else text += invalid;
  }

  return text;
}

function writeString(bb, text) {
  // Sadly a hand-coded UTF8 encoder is much faster than TextEncoder+set in V8
  let n = text.length;
  let byteCount = 0;

  // Write the byte count first
  for (let i = 0; i < n; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < n) {
      c = (c << 10) + text.charCodeAt(++i) - 0x35FDC00;
    }
    byteCount += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  writeVarint32(bb, byteCount);

  let offset = grow(bb, byteCount);
  let bytes = bb.bytes;

  // Then write the bytes
  for (let i = 0; i < n; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < n) {
      c = (c << 10) + text.charCodeAt(++i) - 0x35FDC00;
    }
    if (c < 0x80) {
      bytes[offset++] = c;
    } else {
      if (c < 0x800) {
        bytes[offset++] = ((c >> 6) & 0x1F) | 0xC0;
      } else {
        if (c < 0x10000) {
          bytes[offset++] = ((c >> 12) & 0x0F) | 0xE0;
        } else {
          bytes[offset++] = ((c >> 18) & 0x07) | 0xF0;
          bytes[offset++] = ((c >> 12) & 0x3F) | 0x80;
        }
        bytes[offset++] = ((c >> 6) & 0x3F) | 0x80;
      }
      bytes[offset++] = (c & 0x3F) | 0x80;
    }
  }
}

function writeByteBuffer(bb, buffer) {
  let offset = grow(bb, buffer.limit);
  let from = bb.bytes;
  let to = buffer.bytes;

  // This for loop is much faster than subarray+set on V8
  for (let i = 0, n = buffer.limit; i < n; i++) {
    from[i + offset] = to[i];
  }
}

function readByte(bb) {
  return bb.bytes[advance(bb, 1)];
}

function writeByte(bb, value) {
  let offset = grow(bb, 1);
  bb.bytes[offset] = value;
}

function readFloat(bb) {
  let offset = advance(bb, 4);
  let bytes = bb.bytes;

  // Manual copying is much faster than subarray+set in V8
  f32_u8[0] = bytes[offset++];
  f32_u8[1] = bytes[offset++];
  f32_u8[2] = bytes[offset++];
  f32_u8[3] = bytes[offset++];
  return f32[0];
}

function writeFloat(bb, value) {
  let offset = grow(bb, 4);
  let bytes = bb.bytes;
  f32[0] = value;

  // Manual copying is much faster than subarray+set in V8
  bytes[offset++] = f32_u8[0];
  bytes[offset++] = f32_u8[1];
  bytes[offset++] = f32_u8[2];
  bytes[offset++] = f32_u8[3];
}

function readDouble(bb) {
  let offset = advance(bb, 8);
  let bytes = bb.bytes;

  // Manual copying is much faster than subarray+set in V8
  f64_u8[0] = bytes[offset++];
  f64_u8[1] = bytes[offset++];
  f64_u8[2] = bytes[offset++];
  f64_u8[3] = bytes[offset++];
  f64_u8[4] = bytes[offset++];
  f64_u8[5] = bytes[offset++];
  f64_u8[6] = bytes[offset++];
  f64_u8[7] = bytes[offset++];
  return f64[0];
}

function writeDouble(bb, value) {
  let offset = grow(bb, 8);
  let bytes = bb.bytes;
  f64[0] = value;

  // Manual copying is much faster than subarray+set in V8
  bytes[offset++] = f64_u8[0];
  bytes[offset++] = f64_u8[1];
  bytes[offset++] = f64_u8[2];
  bytes[offset++] = f64_u8[3];
  bytes[offset++] = f64_u8[4];
  bytes[offset++] = f64_u8[5];
  bytes[offset++] = f64_u8[6];
  bytes[offset++] = f64_u8[7];
}

function readInt32(bb) {
  let offset = advance(bb, 4);
  let bytes = bb.bytes;
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  );
}

function writeInt32(bb, value) {
  let offset = grow(bb, 4);
  let bytes = bb.bytes;
  bytes[offset] = value;
  bytes[offset + 1] = value >> 8;
  bytes[offset + 2] = value >> 16;
  bytes[offset + 3] = value >> 24;
}

function readInt64(bb, unsigned) {
  return {
    low: readInt32(bb),
    high: readInt32(bb),
    unsigned,
  };
}

function writeInt64(bb, value) {
  writeInt32(bb, value.low);
  writeInt32(bb, value.high);
}

function readVarint32(bb) {
  let c = 0;
  let value = 0;
  let b;
  do {
    b = readByte(bb);
    if (c < 32) value |= (b & 0x7F) << c;
    c += 7;
  } while (b & 0x80);
  return value;
}

function writeVarint32(bb, value) {
  value >>>= 0;
  while (value >= 0x80) {
    writeByte(bb, (value & 0x7f) | 0x80);
    value >>>= 7;
  }
  writeByte(bb, value);
}

function readVarint64(bb, unsigned) {
  let part0 = 0;
  let part1 = 0;
  let part2 = 0;
  let b;

  b = readByte(bb); part0 = (b & 0x7F); if (b & 0x80) {
    b = readByte(bb); part0 |= (b & 0x7F) << 7; if (b & 0x80) {
      b = readByte(bb); part0 |= (b & 0x7F) << 14; if (b & 0x80) {
        b = readByte(bb); part0 |= (b & 0x7F) << 21; if (b & 0x80) {

          b = readByte(bb); part1 = (b & 0x7F); if (b & 0x80) {
            b = readByte(bb); part1 |= (b & 0x7F) << 7; if (b & 0x80) {
              b = readByte(bb); part1 |= (b & 0x7F) << 14; if (b & 0x80) {
                b = readByte(bb); part1 |= (b & 0x7F) << 21; if (b & 0x80) {

                  b = readByte(bb); part2 = (b & 0x7F); if (b & 0x80) {
                    b = readByte(bb); part2 |= (b & 0x7F) << 7;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    low: part0 | (part1 << 28),
    high: (part1 >>> 4) | (part2 << 24),
    unsigned,
  };
}

function writeVarint64(bb, value) {
  let part0 = value.low >>> 0;
  let part1 = ((value.low >>> 28) | (value.high << 4)) >>> 0;
  let part2 = value.high >>> 24;

  // ref: src/google/protobuf/io/coded_stream.cc
  let size =
    part2 === 0 ?
      part1 === 0 ?
        part0 < 1 << 14 ?
          part0 < 1 << 7 ? 1 : 2 :
          part0 < 1 << 21 ? 3 : 4 :
        part1 < 1 << 14 ?
          part1 < 1 << 7 ? 5 : 6 :
          part1 < 1 << 21 ? 7 : 8 :
      part2 < 1 << 7 ? 9 : 10;

  let offset = grow(bb, size);
  let bytes = bb.bytes;

  switch (size) {
    case 10: bytes[offset + 9] = (part2 >>> 7) & 0x01;
    case 9: bytes[offset + 8] = size !== 9 ? part2 | 0x80 : part2 & 0x7F;
    case 8: bytes[offset + 7] = size !== 8 ? (part1 >>> 21) | 0x80 : (part1 >>> 21) & 0x7F;
    case 7: bytes[offset + 6] = size !== 7 ? (part1 >>> 14) | 0x80 : (part1 >>> 14) & 0x7F;
    case 6: bytes[offset + 5] = size !== 6 ? (part1 >>> 7) | 0x80 : (part1 >>> 7) & 0x7F;
    case 5: bytes[offset + 4] = size !== 5 ? part1 | 0x80 : part1 & 0x7F;
    case 4: bytes[offset + 3] = size !== 4 ? (part0 >>> 21) | 0x80 : (part0 >>> 21) & 0x7F;
    case 3: bytes[offset + 2] = size !== 3 ? (part0 >>> 14) | 0x80 : (part0 >>> 14) & 0x7F;
    case 2: bytes[offset + 1] = size !== 2 ? (part0 >>> 7) | 0x80 : (part0 >>> 7) & 0x7F;
    case 1: bytes[offset] = size !== 1 ? part0 | 0x80 : part0 & 0x7F;
  }
}

function readVarint32ZigZag(bb) {
  let value = readVarint32(bb);

  // ref: src/google/protobuf/wire_format_lite.h
  return (value >>> 1) ^ -(value & 1);
}

function writeVarint32ZigZag(bb, value) {
  // ref: src/google/protobuf/wire_format_lite.h
  writeVarint32(bb, (value << 1) ^ (value >> 31));
}

function readVarint64ZigZag(bb) {
  let value = readVarint64(bb, /* unsigned */ false);
  let low = value.low;
  let high = value.high;
  let flip = -(low & 1);

  // ref: src/google/protobuf/wire_format_lite.h
  return {
    low: ((low >>> 1) | (high << 31)) ^ flip,
    high: (high >>> 1) ^ flip,
    unsigned: false,
  };
}

function writeVarint64ZigZag(bb, value) {
  let low = value.low;
  let high = value.high;
  let flip = high >> 31;

  // ref: src/google/protobuf/wire_format_lite.h
  writeVarint64(bb, {
    low: (low << 1) ^ flip,
    high: ((high << 1) | (low >>> 31)) ^ flip,
    unsigned: false,
  });
}
