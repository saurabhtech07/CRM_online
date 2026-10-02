/* =============================================================
   Real Estate CRM - 01 Create Database
   Run order: 01 -> 02 -> 03
   ============================================================= */

IF DB_ID('RealEstateCRM') IS NULL
BEGIN
    CREATE DATABASE RealEstateCRM;
END
GO

ALTER DATABASE RealEstateCRM SET RECOVERY SIMPLE;
GO
