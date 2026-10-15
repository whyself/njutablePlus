# 公式（formula 列）

来源：官方帮助《The formula column》《Formula Reference》《The Rollup Formula》。函数说明保留官方英文原文。

## 写法规则
- 建公式列：column add，`{"column_name": "总价", "column_type": "formula", "column_data": {"formula": "{单价} * {数量}"}}`。
- 引用同一行的其他列用 `{列名}`。花括号里写**列名**，不是列 key。公式只能用本行的值，不能像 Excel 那样引用别的单元格。
- 字符串用双引号或单引号：`"已报名"`。可以嵌套括号，先乘除后加减。
- 结果类型由公式决定（数字 / 日期 / 文本）。`if` 的两个结果要同一类型，否则另一种会变成空值。
- `if` 的条件只能是比较：`if({名额}>{已报名人数}, "可报名", "已满")`。
- 判断单选列的值：直接和选项**名称**比较，`if({状态}="已取消", 0, 1)`。
- 公式列由系统计算：
  - 不能手动填值；
  - 不能放进表单当输入项；
  - 可以显示在表格页，也可以用在过滤条件里（按结果类型选条件，见 filters.md）。

## 常见用法
- 拼接文字：`concatenate({姓名}, "（", {学号}, "）")`
- 多条件取值：`ifs({分数}>=90, "优", {分数}>=60, "及格", {分数}<60, "不及格")`
- 按值映射：`switch({等级}, "A", 3, "B", 2, 1)`
- 两个日期相差天数：`dateDif({开始日期}, {结束日期}, "D")`
- 距今天数：`dateDif(today(), {截止日期}, "D")`
- 链接表的汇总。也可以用 link-formula 列，见 columns.md 的「链接公式」：
  - `countlinks("报名", "{状态}='已报名'")`：统计链接到本行、且状态为已报名的记录数；
  - `rollup("讲座", "讲座题目", "concatenate")`：把链接记录的某列拼起来。

  链接函数里的列名用**引号**包起来，不用花括号；第一个参数是本表的链接列名，条件参数里才用 `{列名}`。
- 名额判断（配合 countlinks）：`if(countlinks("报名", "{状态}='已报名'") < {名额上限}, "可报名", "已满")`

## 函数：行

- `rowID()` — Returns the unique identification number of the current row as a string.

## 函数：常量

- `true()` — Returns the logical value ’true'. 例：`true() = true`
- `false()` — Returns the logical value ‘false’. 例：`false() = false`

## 函数：运算

- `add(num1, num2)` — Adds two numeric values (num1 and num2) and returns the result. 例：`add(1, 2) = 3`
- `subtract(num1, num2)` — Subtracts one numeric value (num2) from another (num1). 例：`subtract(5, 4) = 1`
- `multiply(num1, num2)` — Multiplies two numerical values. 例：`multiply(3, 4) = 12`
- `divide(num1, num2)` — Divides one numeric value (num1) by another (num2). 例：`divide(5, 2) = 2.5`
- `mod(num1, num2)` — Calculates the remainder of a division. 例：`mod(10, 7) = 3`
- `power(num1, num2)` — Calculates the power (num2) of a number (num1). 例：`power(3, 2) = 9`
- `greater(num1, num2)` — Checks whether a numeric value (num1) is greater than another (num2) and returns the logical value ’true’ or ‘false’. 例：`greater(2, 3) = false`
- `lessthan(num1, num2)` — Checks whether a numeric value (num1) is smaller than another (num2) and returns the logical value ’true’ or ‘false’. 例：`lessthan(2, 3) = true`
- `greatereq(num1, num2)` — Checks whether a numeric value (num1) is greater than or equal to another (num2) and returns the logical value ’true’ or ‘false’. 例：`greatereq(2, 3) = false`
- `lessthaneq(num1, num2)` — Checks whether a numeric value (num1) is less than or equal to another (num2) and returns the logical value ’true’ or ‘false’. 例：`lessthaneq(2, 3) = true`
- `equal(number1, number2)` — Checks whether two values (number1, number 2) are equal and returns the logical value ’true’ or ‘false’. 例：`equal({Old price}, {New price}) = false`
- `unequal(number1, number2)` — Checks whether two values (number1, number2) are unequal and returns the logical value ’true’ or ‘false’ in each case. 例：`unequal({Old price}, {New price}) = true`
- `concatenate(string1, string2, …)` — Concatenates several strings (string1, string 2, …) into one string. 例：`concatenate({Supplier}, " is ", {Status}) = Linux is great`

## 函数：数学函数

- `abs(number)` — Returns the absolute value of a number. 例：`abs(-2)`
- `ceiling(number, significance)` — Rounds a number to the nearest integer or to the nearest multiple of the specified step (significance). 例：`ceiling(2.14)`
- `even(number)` — Assigns the nearest larger even number to a real number (number). 例：`even(2.14)`
- `exp(number)` — Exponential function for Euler’s number e. 例：`exp(1)`
- `floor(number, significance)` — Rounds a number to the nearest integer or to the nearest multiple of the specified step (significance). 例：`floor(2.86)`
- `int(number)` — Assigns the nearest smaller integer to a real number (number). 例：`int(-3.14)`
- `lg(number)` — Logarithm function (number) with 10 as base. 例：`lg(100)`
- `ln(number)` — Logarithm function (number) with Euler’s number e as the base. 例：`ln(e)`
- `log(number, base)` — Logarithm function (number) with definable base. 例：`log(81, 3)`
- `odd(number)` — Assigns the nearest larger odd number to a real number (number). 例：`odd(-2.14)`
- `round(number, digits)` — Rounds a number to a specified number of decimal places (digits). 例：`round(3.14)`
- `rounddown(number, digits)` — Round a number in the direction of zero. 例：`rounddown(3.12, 1)`
- `roundup(number, digits)` — Rounds a number up from zero. 例：`roundup(3.12, 1)`
- `sign(number)` — Checks whether a number is greater than, equal to or less than 0. 例：`sign(-2)`
- `sqrt(number)` — Returns the square root of a number. 例：`sqrt(81)`
- `sum(num1, num2, …)` — Returns the sum of the numbers (num1, num2, …). 例：`sum(7,8,9)`

## 函数：文本函数

- `concatenate(text1, text2, text3)` — Concatenates several strings (text1, text2, text3, …) into one string. 例：`concatenate("Sea", "Table", " ", "Cloud")`
- `exact(string1, string2)` — Checks whether two strings (string1, string2) are exactly identical. 例：`exact('SeaTable', 'Seatable')`
- `find(findString, sourceString, startPosition)` — Returns the start position of a string (findString) within another string (sourceString). 例：`find('Sea', 'seaTable', 1)`
- `left(string, count)` — Returns the specified number (count) of characters at the beginning of a string. 例：`left('SeaTable', 3)`
- `len(string)` — Returns the number of characters in a string. 例：`len('SeaTable')`
- `lower(string)` — Converts a string into lower case letters. 例：`lower('DeutscH')`
- `mid(string, startPosition, count)` — Returns the specified number (count) of characters from the specified start position (startPosition) from a string. 例：`mid('SeaTable is the best', 1, 8)`
- `replace(sourceString, startPosition, count, newString)` — Replaces a part (count) of a string (sourceString) from a certain start position (startPosition) with another string (newString). 例：`replace('SeaTable is the best.', 1, 8, 'Seafile')`
- `rept(string, number)` — Repeats a string as many times (number) as specified. 例：`rept('Sea ', 3)`
- `right(string, count)` — Returns the specified number (count) of characters at the end of a string. 例：`right('SeaTable', 5)`
- `search(findString, sourceString, startPosition)` — Returns the start position of a string (findString) within another string (sourceString). 例：`search('Sea', 'seaTable', 1)`
- `substitute(sourceString, oldString, newString, index)` — Replaces existing text (oldString) with new text (newString) in a string (sourceString). 例：`substitute('SeaTableTable', 'Table', 'file', 1)`
- `T(value)` — Checks whether a value is text. 例：`T(123)`
- `text(number, format)` — Converts a number into text and formats it in the specified format. 例：`text(150, 'euro')`
- `trim(string)` — Removes spaces at the beginning and end of a string. 例：`trim(' SeaTable ')`
- `upper(string)` — Converts a string into upper case letters. 例：`upper('DeutscH')`
- `value(string)` — Converts a text (string) representing a number into a number. 例：`value('123')`

## 函数：日期函数

- `date(year, month, day)` — Returns a date in international format (ISO) from the entered year, month and day. 例：`date(2021, 1, 3)`
- `dateAdd(date, count, unit)` — Adds the specified number (count) of years, months, weeks, days, hours, minutes or seconds to a date/time. 例：`dateAdd('2020-02-03', 2, 'days')`
- `dateDif(startDate, endDate, unit)` — Calculates the seconds, days, months or years between two date values. 例：`dateDif('2018-01-01', '2020-01-01', 'Y')`
- `datetimeFormat(date, format)` — Converts the value of a date column into a string. 例：`datetimeFormat("2020-01-01", "MM/DD/YYYY")`
- `day(date)` — Returns the day of a date as a number. 例：`day('2020-01-03')`
- `days(startDate, endDate)` — Returns the number of days between two date values (startDate and endDate). 例：`days('2020-01-01', '2020-02-03')`
- `eomonth(startDate, months)` — Determines the date of the last day of the month that is the specified number (months) of months after the specified date (startDate). 例：`eomonth('2020-01-01', 1)`
- `hour(date)` — Returns the hour of a time (date) as a number. 例：`hour('2020-02-14 13:14:52')`
- `hours(startDate, endDate)` — Returns the number of hours between two date values (startDate and endDate). 例：`hours('2020-02-14 13:14', '2020-02-14 15:14')`
- `minute(date)` — Returns the minutes of a time (date) as a number. 例：`minute('2020-02-14 13:14:52')`
- `month(date)` — Returns the month of a date as a number. 例：`month('2020-02-14 13:14:52')`
- `months(startDate, endDate)` — Returns the number of months between two date values (startDate and endDate). 例：`months('2020-02-01 13:14', '2020-03-31 15:54')`
- `networkdays(startDate, endDate, holiday1, holiday2, …)` — Returns the number of whole working days between two date values (startDate and endDate). 例：`networkdays('2020-01-01', '2020-01-07','2020-01-01')`
- `now()` — Returns the current date and time. 例：`now()`
- `second(date)` — Returns the seconds of a time (date) as a number. 例：`second('2020-02-14 13:14:52')`
- `today()` — Returns the current date. 例：`today()`
- `weekday(date, weekStart)` — Returns the day of the week of a date as a number. 例：`weekday('2020-01-01', 'Monday')`
- `weeknum(date, return_type)` — Returns the absolute week number of a date as a number. 例：`weeknum('2020-01-12', 11)`
- `isoweeknum(date)` — Returns the ISO week number (KW) of a date as a number. 例：`isoweeknum('2021-01-04')`
- `year(date)` — Returns the year of a date as a number. 例：`year('2020-01-01')`

## 函数：逻辑函数

- `and(logical1, logical2, …)` — Checks whether all arguments (logical1, logical2, …) are true (valid, non-empty and non-zero). 例：`and(1, '', 2)`
- `if(logical, value1, value2)` — Checks if an argument (logical) is true and if yes, returns the first value (value1) and if no, returns the second value (value2). 例：`if(1>2, 3, 4)`
- `ifs(logical1, value1, logical2, value2, …)` — Checks whether one or more conditions (logical1, logical2, …) are true and returns a value (value1, value2, …) that matches the first TRUE condition. 例：`ifs( 1>2, 3, 5>4, 9)`
- `isempty("columnname")` — Checks whether a cell in the specified column is empty. 例：`isempty("Calendar Event ID")`
- `iserror(value)` — Checks whether the argument is an error value. 例：`iserror("#VALUE!")`
- `not(boolean)` — Reverses the logical value (boolean). 例：`not(and(1, '', 2))`
- `or(logical1, logical2, …)` — Checks if at least 1 of the arguments (value1, value2, …) is true (valid, non-empty and non-zero) and returns ’true’ in this case. 例：`or(1, '', 2)`
- `switch(logical, matcher1, value1, matcher2, value2, …, default)` — Evaluates an expression (logical) against a list of values (matcher) and returns the result (value) that matches the first matching value. 例：`switch(weekday("2000-01-01"), 1, "Sunday", 2, "Monday", 3, "Tuesday", 4, "Wednesday", 5,  …`
- `xor(logical1, logical2, …)` — Returns the contravalence of all arguments. 例：`xor(1, 0, 2<1, 1)`

## 函数：统计函数

- `average(number1, number2, …)` — Returns the average of the numbers (number1, number2, …). 例：`average(1, 2, 3, 4, 5) = 3`
- `count(number1, number2, …)` — Returns the number of numbers (number1, number2, …). 例：`count(1, '', 2, '3') = 2`
- `counta(textORnumber1, textORnumber2, …)` — Counts the number of non-empty cells (textORnumber1, textORnumber2, …). 例：`counta(1, '', 2, '3') = 3`
- `countall(textORnumber1, textORnumber2, …)` — Counts the number of elements (textORnumber1, textORnumber2, …) including numbers (1, 2), text (‘3’) and empty cells (’’). 例：`countall(1, '', 2, '3') = 4`
- `countblank(textORnumber1, textORnumber2, …)` — Counts the number of empty cells. 例：`countall(1, '', 2, '3') = 1`
- `countItems("column-name")` — Counts the number of elements in a cell. 例：`countItems("members") = 6`
- `max(number1, number2, …)` — Returns the largest value from the specified numbers (number1, number2, …). 例：`max(-1, 3, 4, 2, -1) = 4`
- `min(number1, number2, …)` — Returns the smallest value from the specified numbers (number1, number2, …). 例：`min(-1, 3, 4, 2, -1) = -1`
- `large(num1, num2, …, k)` — Returns the k-largest value from the list of numbers (num1, num2, …). 例：`large(35, 92, 10, 2) = 35`
- `small(num1, num2, …, k)` — Returns the k-smallest value from the list of numbers (num1, num2, …). 例：`small(9, 2, -7, -3, 3) = 2`

## 函数：链接函数（引用链接列）

- `countlinks("Column", [condition])` — Counts the linked entries in the given link column. 例：`countlinks("Speakers", "{Price}>500") = 3 (The number of entries linked to the "Speakers" …`
- `rollup("Column", "Other column", summary, [condition])` — Returns an evaluated value of linked entries in other tables. 例：`rollup("Speakers", "Power", "max", "{Price} < 500") = 80 (The largest value of the entries…`
- `lookup(findmax("Column", "Other column"), "Target")` — Searches for the largest value in the linked column (“Other column”) and returns the value in the same row from another column (“Target”). 例：`lookup(findmax("Speakers", "Power"), "Price") = 350 (Returns the largest value "Price" in …`
- `lookup(findmin("Column", "Other column"), "Target")` — Searches for the smallest value in the linked column (“Other column”) and returns the value in the same row from another column (“Target”). 例：`lookup(findmin("Speakers", "Power"), "Price") = 210 (The "Price" of the smallest value in …`
