//! Native services and shared input validation, independent of the desktop shell.
pub mod hsr;
pub mod storage;
pub use hsr::{MAX_RESPONSE_BYTES, Page, ParseError, Roll, parse_response};

use serde::Deserializer;
use serde::de::{Error, MapAccess, SeqAccess, Visitor};
use serde_json::value::RawValue;
use std::{collections::BTreeSet, fmt};

/// Reject ambiguous JSON before map decoding can discard duplicate members.
/// Inspect raw children so exact numbers and object keys remain distinguishable.
pub(crate) fn validate_json(bytes: &[u8]) -> Result<(), serde_json::Error> {
    let mut decoder = serde_json::Deserializer::from_slice(bytes);
    decoder.deserialize_any(UniqueMembers { depth: 0 })?;
    decoder.end()
}

/// Bound nested validation independently of the raw-value decoder's traversal.
struct UniqueMembers {
    depth: usize,
}
impl UniqueMembers {
    fn child(self, value: &RawValue) -> Result<(), serde_json::Error> {
        if self.depth >= 128 {
            return Err(serde_json::Error::custom("JSON nesting limit exceeded"));
        }
        let visitor = Self {
            depth: self.depth + 1,
        };
        let mut decoder = serde_json::Deserializer::from_str(value.get());
        match value.get().as_bytes()[0] {
            b'{' => decoder.deserialize_map(visitor),
            b'[' => decoder.deserialize_seq(visitor),
            _ => Ok(()),
        }
    }
}
impl<'de> Visitor<'de> for UniqueMembers {
    type Value = ();
    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a JSON object or array")
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<(), A::Error> {
        let mut keys = BTreeSet::new();
        while let Some(key) = map.next_key::<String>()? {
            // Serde's arbitrary-precision marker must never reinterpret a source object.
            if key == "$serde_json::private::Number" || !keys.insert(key) {
                return Err(A::Error::custom("ambiguous JSON member"));
            }
            let value: &RawValue = map.next_value()?;
            Self { depth: self.depth }
                .child(value)
                .map_err(A::Error::custom)?;
        }
        Ok(())
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<(), A::Error> {
        while let Some(value) = sequence.next_element::<&RawValue>()? {
            Self { depth: self.depth }
                .child(value)
                .map_err(A::Error::custom)?;
        }
        Ok(())
    }
}
