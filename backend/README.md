# backend

## Loading example data

Load the example csv data into the database using psql:

```sql
create temporary table t (
    isbn13 text,isbn10 text,title text,subtitle text,authors text,categories text,thumbnail text,description text,published_year integer,average_rating float,num_pages integer,ratings_count integer);
\copy t(isbn13, isbn10, title, subtitle, authors, categories, thumbnail, description, published_year, average_rating, num_pages, ratings_count) FROM 'data/books.csv' DELIMITER ',' CSV HEADER;

ALTER TABLE authors ADD CONSTRAINT authors_name_key UNIQUE (name);
INSERT INTO authors (name)
SELECT DISTINCT btrim(author)
FROM t, unnest(string_to_array(authors, ';')) AS author
WHERE author <> ''
ON CONFLICT (name) DO NOTHING;
ALTER TABLE authors DROP CONSTRAINT authors_name_key;

-- copy books into the books table
INSERT INTO books (isbn, title)
SELECT isbn13, title FROM t;

-- create book_authors for each author of each book
INSERT INTO book_authors (book_isbn, author_id)
SELECT isbn13 as book_isbn, a.id as author_id FROM (SELECT isbn13, unnest(string_to_array(authors, ';')) AS author
FROM t) as bt
JOIN authors a ON btrim(a.name) = btrim(bt.author);
```

why do i get the error:
ERROR:  new row for relation "authors" violates check constraint "name_not_empty_ck"

The error message "new row for relation 'authors' violates check constraint 'name_not_empty_ck'" indicates that there is a check constraint on the "name" column of the "authors" table that requires the name to be non-empty.

Why is the name empty? can i remove it from the insert?

The error occurs because the `authors` column in your CSV data may contain empty strings or null values after splitting the string by the semicolon (`;`). When you use `unnest(string_to_array(authors, ';'))`, it generates rows for each author, including any empty strings that result from consecutive semicolons or leading/trailing semicolons.

To avoid this error, you can add a `WHERE` clause to filter out empty author names before the insert:

```sql
INSERT INTO authors (name)
SELECT DISTINCT btrim(author)
FROM t, unnest(string_to_array(authors, ';')) AS author
WHERE author <> ''
ON CONFLICT (name) DO NOTHING;
```

This still gives the same error

The error persists because the `btrim(author)` function can still return an empty string if the `author` variable contains only whitespace characters. To ensure that you are filtering out both empty strings and strings that consist solely of whitespace, you can modify the `WHERE` clause to check for trimmed values:

```sql
INSERT INTO authors (name)
SELECT DISTINCT btrim(author) AS trimmed_author
FROM t, unnest(string_to_array(authors, ';')) AS author
WHERE btrim(author) <> ''
ON CONFLICT (name) DO NOTHING;
```

Sorry still the same


If you're still encountering the same error, it's possible that there are still some entries in your data that are not being filtered out correctly. To further diagnose the issue, you can run a query to identify any problematic entries before performing the insert.

```sql
SELECT DISTINCT btrim(author) AS trimmed_author
FROM t, unnest(string_to_array(authors, ';')) AS author
WHERE btrim(author) = '';