pub struct AdaptiveLimit {
    pub current: u32,
    pub max_seen_healthy: u32,
    pub consecutive_successes: u32,
    pub consecutive_failures: u32,
    pub absolute_max: u32,
    pub probe_threshold: u32,
}

impl AdaptiveLimit {
    pub fn new(start: u32, absolute_max: u32, probe_threshold: u32) -> Self {
        Self {
            current: start,
            max_seen_healthy: start,
            consecutive_successes: 0,
            consecutive_failures: 0,
            absolute_max,
            probe_threshold,
        }
    }

    pub fn record_success(&mut self) {
        self.consecutive_failures = 0;
        self.consecutive_successes += 1;
        if self.consecutive_successes >= self.probe_threshold {
            self.current = (self.current + 1).min(self.absolute_max);
            self.consecutive_successes = 0;
            if self.current > self.max_seen_healthy {
                self.max_seen_healthy = self.current;
            }
        }
    }

    pub fn record_failure(&mut self) {
        self.consecutive_successes = 0;
        self.consecutive_failures += 1;
        self.current = (self.current / 2).max(1);
    }

    pub fn restore_from_persisted(&mut self, max_seen: u32) {
        self.current = max_seen.min(self.absolute_max);
        self.max_seen_healthy = max_seen.min(self.absolute_max);
    }
}
