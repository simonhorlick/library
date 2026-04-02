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
