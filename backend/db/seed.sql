-- Sample data for the Kanban board.
-- Re-runnable: clears the three tables first, then repopulates.
TRUNCATE card_users, cards, users RESTART IDENTITY CASCADE;

INSERT INTO users (name, email) VALUES
    ('Uma Patel',    'uma@example.com'),
    ('Ivan Reyes',   'ivan@example.com'),
    ('Jade Kim',     'jade@example.com'),
    ('Noah Bennett', 'noah@example.com');

INSERT INTO cards (title, description, stage) VALUES
    ('Audit competitor onboarding flows', 'Compare signup funnels of the top 5 competitors.', 'todo'),
    ('Draft Q3 design OKRs',              'Define measurable objectives for the next quarter.', 'todo'),
    ('Update design style guide',         'Roll the new color palette into the shared style guide.', 'in_progress'),
    ('Conduct usability testing',         'Run moderated sessions on the mobile app prototype.', 'in_progress'),
    ('Create a new landing page redesign','Ship the refreshed marketing landing page.', 'completed');

-- Assignments. Note card 3 ("Update design style guide") is assigned to
-- THREE users, demonstrating the many-to-many card_users relationship.
INSERT INTO card_users (card_id, user_id) VALUES
    (1, 2),           -- Audit flows            -> Ivan
    (2, 3),           -- Q3 OKRs                -> Jade
    (3, 1), (3, 2), (3, 3),  -- Style guide     -> Uma, Ivan, Jade
    (4, 1), (4, 4),   -- Usability testing      -> Uma, Noah
    (5, 3);           -- Landing page           -> Jade
