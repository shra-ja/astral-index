//! The local time that names what the app writes: the copies it keeps beside the
//! history before an upgrade or a restore, and the backup and export names it
//! suggests.

use chrono::{DateTime, FixedOffset, Local, NaiveDateTime};

/// The local time now; commands read it once and pass it in, so their unit tests
/// can fix it.
pub fn now() -> NaiveDateTime {
    Local::now().naive_local()
}

/// The moment now, with the local time's offset, for what needs both the local
/// day and the instant, as an export's name and timestamp do.
pub fn moment() -> DateTime<FixedOffset> {
    Local::now().fixed_offset()
}

/// `time` as the kept copies' names show it, such as `20261020-143000`.
pub fn stamp(time: NaiveDateTime) -> String {
    time.format("%Y%m%d-%H%M%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn a_time_is_stamped_as_the_kept_copies_name_it() {
        let time = NaiveDate::from_ymd_opt(2026, 10, 20)
            .unwrap()
            .and_hms_opt(14, 3, 9)
            .unwrap();
        assert_eq!(stamp(time), "20261020-140309");
    }

    #[test]
    fn now_is_the_local_time() {
        let before = chrono::Local::now().naive_local();
        let read = now();
        let after = chrono::Local::now().naive_local();
        assert!((before..=after).contains(&read), "{before} {read} {after}");
    }

    #[test]
    fn the_moment_is_now_with_the_local_offset() {
        let before = chrono::Local::now();
        let read = moment();
        let after = chrono::Local::now();
        assert!((before..=after).contains(&read), "{before} {read} {after}");
        assert_eq!(read.offset(), after.offset());
    }
}
