const { calculateDaysSinceStart, getEmailTemplateForDay, calculateNextDripAt } = require('./dripCampaignService');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('calculateDaysSinceStart', () => {
    it('should return 0 for the same day', () => {
        const start = 1000000;
        const now = start + 1000; // 1 second later
        expect(calculateDaysSinceStart(start, now)).toBe(0);
    });

    it('should return 1 after exactly 24 hours', () => {
        const start = 1000000;
        const now = start + MS_PER_DAY;
        expect(calculateDaysSinceStart(start, now)).toBe(1);
    });

    it('should floor the days', () => {
        const start = 1000000;
        const now = start + MS_PER_DAY + (MS_PER_DAY / 2); // 1.5 days
        expect(calculateDaysSinceStart(start, now)).toBe(1);
    });

    it('should return -1 if arguments are invalid', () => {
        expect(calculateDaysSinceStart(null, 10000)).toBe(-1);
        expect(calculateDaysSinceStart(10000, undefined)).toBe(-1);
    });
});

describe('getEmailTemplateForDay', () => {
    const store = { name: 'Test Store' };

    it('should return day 1 template', () => {
        const template = getEmailTemplateForDay(1, store);
        expect(template).toBeDefined();
        expect(template.key).toBe('day1');
        expect(template.subject).toContain('Welcome');
    });

    it('should return day 3 template', () => {
        const template = getEmailTemplateForDay(3, store);
        expect(template.key).toBe('day3');
        expect(template.text).toContain('Test Store');
        expect(template.subject).toContain('Tip:');
    });

    it('should return day 6 template instead of day 7', () => {
        const template = getEmailTemplateForDay(6, store);
        expect(template.key).toBe('day6');
        expect(template.subject).toContain('Action Required');
    });

    it('should return null for undefined days', () => {
        expect(getEmailTemplateForDay(2, store)).toBeNull();
        expect(getEmailTemplateForDay(4, store)).toBeNull();
        expect(getEmailTemplateForDay(10, store)).toBeNull();
    });
});

describe('calculateNextDripAt', () => {
    const startMs = 1000000;

    it('should schedule day 3 if current day is 1', () => {
        expect(calculateNextDripAt(1, startMs)).toBe(startMs + (3 * MS_PER_DAY));
    });

    it('should schedule day 5 if current day is 3', () => {
        expect(calculateNextDripAt(3, startMs)).toBe(startMs + (5 * MS_PER_DAY));
    });

    it('should schedule day 6 if current day is 5', () => {
        expect(calculateNextDripAt(5, startMs)).toBe(startMs + (6 * MS_PER_DAY));
    });

    it('should return null if current day is 6 or greater', () => {
        expect(calculateNextDripAt(6, startMs)).toBeNull();
        expect(calculateNextDripAt(7, startMs)).toBeNull();
    });

    it('should catch up if days were skipped', () => {
        // if we are checking on day 2 (missed day 1 run, but template lookup would fail or we would just use day 2 math logic)
        // Our logic for "if template not found" passes daysSince to calculateNextDripAt
        expect(calculateNextDripAt(2, startMs)).toBe(startMs + (3 * MS_PER_DAY));
        expect(calculateNextDripAt(4, startMs)).toBe(startMs + (5 * MS_PER_DAY));
    });
});
